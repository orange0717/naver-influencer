import { NextRequest, NextResponse } from 'next/server';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { checkBlogTab, checkViewTab, checkInfluencerTab, getSearchVolume, CACHE_TTL_SEC, type RankCheckResult } from '@/lib/keyword-rank-check';

export const dynamic = 'force-dynamic';

// 동일 인스턴스 내 동시 요청 공유: 같은 cacheKey를 여러 사용자가 동시에 조회해도
// 진행 중인 크롤링 하나만 수행하고 결과를 나눠 갖는다 (네이버 요청 중복 방지)
const inFlight = new Map<string, Promise<RankCheckResult>>();

// displayName 캐시 (30분, 프로세스 로컬 — DB 조회가 이미 빠름)
const nameCache = new Map<string, { name: string; expires: number }>();
const NAME_CACHE_TTL = 30 * 60 * 1000;

/**
 * 서버에서 blogId로 displayName(blog_name) 직접 조회
 */
async function getDisplayName(blogId: string): Promise<string> {
  const cached = nameCache.get(blogId);
  if (cached && cached.expires > Date.now()) return cached.name;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('blog_scores')
      .select('blog_name')
      .eq('blog_id', blogId)
      .single();
    const name = data?.blog_name || '';
    nameCache.set(blogId, { name, expires: Date.now() + NAME_CACHE_TTL });
    // 캐시 크기 제한
    if (nameCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of nameCache) { if (v.expires < now) nameCache.delete(k); }
    }
    return name;
  } catch {
    return '';
  }
}

// 한국어 조사 제거: "블로그의" → "블로그", "미래는" → "미래"
function stripParticles(word: string): string {
  const particles2 = ['에서','에게','으로','처럼','만큼','부터','까지','마저','조차','이란','이라','에는','에도','으로서'];
  for (const p of particles2) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  const particles1 = ['의','에','를','을','이','가','는','은','와','과','도','로','만','란','라','며','면','야'];
  for (const p of particles1) {
    if (word.length > 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 검색어에서 제거할 클릭베이트/서식 노이즈 토큰 (예: "TOP3", "BEST5")
const SEARCH_NOISE_RE = /\bTOP\s?\d*\b|\bBEST\s?\d*\b/gi;
// 구분자로 쓰이는 특수문자 (예: "제목 | 부제목", "제목 - 부제목", "제목: 설명")
const SEARCH_SEPARATOR_RE = /[|:\-~!?"'『』「」<>·•,.]/g;

/**
 * 미노출 검사용 검색어 정제: 포스팅 제목을 그대로 검색하기 위한 최소 정제
 * - 블로그 이름/닉네임 제거 (검색 결과가 본인 블로그명으로 오염되는 것 방지)
 * - 대괄호/소괄호 주석([공지], (협찬) 등) 제거
 * - 특수문자·구분자·클릭베이트 토큰(TOP3 등) 제거
 * - 대표 키워드를 뽑지 않고 제목의 의미는 그대로 유지한다
 */
function cleanTitleForSearch(title: string, blogId: string, displayName?: string): string {
  let cleaned = title;
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) removePatterns.push(displayName);
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(escapeRegExp(p), 'gi'), ' ');
  }
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  cleaned = cleaned.replace(SEARCH_NOISE_RE, ' ').replace(SEARCH_SEPARATOR_RE, ' ');
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * 제목 기반 검색 후보 생성 (미노출 검사 전용)
 * - 1순위: 정제된 제목 전체 (대표 키워드가 아닌 실제 제목으로 검색)
 * - 제목이 길어 정확도가 떨어질 수 있는 경우, 어절 단위로 자연스럽게 분리해 2~4개 후보 생성
 * - 조사는 어절 단위로만 제거하고, 의미 있는 단어는 그대로 유지한다 (불용어 필터링 없음)
 */
function buildTitleSearchCandidates(title: string, blogId: string, displayName?: string): string[] {
  const cleaned = cleanTitleForSearch(title, blogId, displayName);
  const words = cleaned
    .split(' ')
    .filter(Boolean)
    .map(w => (/^[가-힣]+$/.test(w) ? stripParticles(w) : w))
    .filter(Boolean);

  const fullQuery = words.join(' ');
  const candidates: string[] = [];
  if (fullQuery) candidates.push(fullQuery);

  const MAX_QUERY_LEN = 25; // 이보다 길면 검색 정확도가 떨어질 수 있어 어절 단위로 분리
  if (fullQuery.length > MAX_QUERY_LEN && words.length >= 2) {
    const half = Math.ceil(words.length / 2);
    const front = words.slice(0, half).join(' ');
    const back = words.slice(half).join(' ');
    if (front && front !== fullQuery) candidates.push(front);
    if (back && back !== fullQuery && back !== front) candidates.push(back);

    if (words.length >= 4) {
      const twoThirds = Math.ceil((words.length * 2) / 3);
      const frontShort = words.slice(0, twoThirds).join(' ');
      if (frontShort && !candidates.includes(frontShort)) candidates.push(frontShort);
    }
  }

  if (candidates.length === 0) {
    const rawFallback = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    candidates.push((rawFallback || title).slice(0, 20));
  }
  return candidates.slice(0, 4);
}

/**
 * POST /api/blog/check-missing
 * 포스팅의 블로그탭 + 통합검색 노출/누락 여부 확인
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await blogAnalyzeLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const { blogId, postTitle, postId, keyword, force, checkInfluencer } = body;

    if (!blogId || (!postTitle && !keyword)) {
      return NextResponse.json({ error: 'blogId, postTitle 또는 keyword 필수' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, String(blogId));
    if (denied) return denied;

    // 캐시 확인 (Redis 공유 — 다른 인스턴스/기기가 확인한 결과도 재사용). force=true면 건너뛰고 강제 재조회.
    const cacheKey = keyword
      ? `rank:${blogId}:${postId || ''}:kw:${keyword.trim()}`
      : `rank:${blogId}:${postId || postTitle.slice(0, 30)}`;
    if (!force) {
      const cached = await cacheGet<RankCheckResult>(cacheKey);
      if (cached !== null) {
        // 캐시 히트는 네이버를 치지 않으므로 클라이언트가 대기 없이 다음 키워드로 넘어갈 수 있다.
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // 같은 키에 대해 이미 진행 중인 조회가 있으면 그 결과를 공유 (동시 접속 사용자 간 중복 크롤링 방지)
    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = (async (): Promise<RankCheckResult> => {
        // 사용자 지정 키워드가 있으면 그대로 사용, 없으면 포스팅 제목 전체(+분리 후보)로 검색
        const displayName = await getDisplayName(blogId);
        const candidates: string[] = keyword && keyword.trim()
          ? [keyword.trim()]
          : buildTitleSearchCandidates(postTitle, blogId, displayName);
        const query = candidates[0];

        // 블로그탭 + 통합검색 + (사용자 지정 키워드 또는 checkInfluencer 명시 요청 시) 인플루언서탭 동시 확인
        // 인플루언서탭 확인은 네이버 요청이 추가로 3페이지 늘어나므로, 필요치 않은 호출(경쟁분석 등)엔 기본 비활성
        const hasKeyword = Boolean(keyword && keyword.trim()) || Boolean(checkInfluencer);
        const [blogTabResult, viewTabResult, influencerTabResult] = await Promise.all([
          checkBlogTab(query, blogId, postId || ''),
          checkViewTab(query, blogId, postId || ''),
          hasKeyword ? checkInfluencerTab(query, blogId, postId || '') : Promise.resolve({ exposed: false, rank: null }),
        ]);
        let blogTab = blogTabResult;
        let viewTab = viewTabResult;
        let influencerTab = influencerTabResult;

        // 후보가 여러 개면, 아직 미노출인 영역만 다음 후보로 순차 재시도 (하나라도 노출되면 그 결과를 채택)
        for (let i = 1; i < candidates.length; i++) {
          const allExposed = blogTab.exposed && viewTab.exposed && (!hasKeyword || influencerTab.exposed);
          if (allExposed) break;
          const cand = candidates[i];
          const [cBlog, cView, cInf] = await Promise.all([
            !blogTab.exposed ? checkBlogTab(cand, blogId, postId || '') : Promise.resolve(blogTab),
            !viewTab.exposed ? checkViewTab(cand, blogId, postId || '') : Promise.resolve(viewTab),
            (hasKeyword && !influencerTab.exposed) ? checkInfluencerTab(cand, blogId, postId || '') : Promise.resolve(influencerTab),
          ]);
          if (cBlog.exposed) blogTab = cBlog;
          if (cView.exposed) viewTab = cView;
          if (cInf.exposed) influencerTab = cInf;
          await new Promise(r => setTimeout(r, 300));
        }

        // 검색량 조회 (순위 공식용)
        const searchVolume = await getSearchVolume(query);

        const freshResult: RankCheckResult = {
          blogTab: { exposed: blogTab.exposed, rank: blogTab.rank },
          viewTab: { exposed: viewTab.exposed, rank: viewTab.rank },
          influencerTab: { exposed: influencerTab.exposed, rank: influencerTab.rank },
          query,
          candidates,
          searchVolume,
          checkedAt: new Date().toISOString(),
        };

        // 캐시 저장 (공유)
        await cacheSet(cacheKey, freshResult, CACHE_TTL_SEC);

        // 검사 결과 즉시 DB 반영 (포스트 1개 검사 → 저장, 전체 일괄 계산 방지)
        if (postId) {
          try {
            const supabase = createServiceClient();
            await supabase.from('post_missing_checks').upsert({
              blog_id: blogId,
              post_id: String(postId),
              post_title: postTitle || null,
              query,
              search_candidates: candidates,
              view_exposed: viewTab.exposed,
              view_rank: viewTab.rank,
              blog_exposed: blogTab.exposed,
              blog_rank: blogTab.rank,
              influencer_exposed: hasKeyword ? influencerTab.exposed : null,
              influencer_rank: hasKeyword ? influencerTab.rank : null,
              search_volume: searchVolume,
              status: 'ok',
              fail_count: 0,
              checked_at: freshResult.checkedAt,
            }, { onConflict: 'blog_id,post_id' });
          } catch (err) {
            // DB 저장 실패는 응답에 영향 주지 않음 (캐시된 결과는 이미 반환) — 다만 원인 추적을 위해 로그는 남긴다
            console.error(`[check-missing] post_missing_checks 저장 실패 blogId=${blogId} postId=${postId} query="${query}":`, err);
          }
        }

        return freshResult;
      })();
      inFlight.set(cacheKey, promise);
      promise.finally(() => inFlight.delete(cacheKey));
    }

    const result = await promise;
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    console.error('[check-missing] 요청 처리 중 예외:', err);
    return NextResponse.json({ error: '누락 확인 중 오류' }, { status: 500 });
  }
}
