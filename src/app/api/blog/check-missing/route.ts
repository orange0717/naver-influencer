import { NextRequest, NextResponse } from 'next/server';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { checkBlogTab, checkViewTab, checkInfluencerTab, getSearchVolume, CACHE_TTL_SEC } from '@/lib/keyword-rank-check';

export const dynamic = 'force-dynamic';

// 미노출 검사 응답 — 노출 여부는 boolean(확정) 또는 null(미확인/일시적 오류로 확인 불가).
// status로 노출/미노출 외의 '일시적 오류'(error)·'분석불가'(unanalyzable)를 구분해 미노출 오판을 방지한다.
type TabState = { exposed: boolean | null; rank: number | null };
type MissingCheckResult = {
  blogTab: TabState;
  viewTab: TabState;
  influencerTab: TabState;
  query: string;
  candidates?: string[];
  searchVolume: number;
  status: 'ok' | 'error' | 'unanalyzable';
  checkedAt: string;
};

// 동일 인스턴스 내 동시 요청 공유: 같은 cacheKey를 여러 사용자가 동시에 조회해도
// 진행 중인 크롤링 하나만 수행하고 결과를 나눠 갖는다 (네이버 요청 중복 방지)
const inFlight = new Map<string, Promise<MissingCheckResult>>();

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

// 세 영역 노출값을 하나의 종합 상태로 요약 — 이력 전환 판정용
// 하나라도 명시적 미노출(false)이면 'missing', 아니면 하나라도 노출(true)이면 'exposed', 전부 미확인이면 'unknown'
function overallExposureState(view: boolean | null, blog: boolean | null, inf: boolean | null): 'exposed' | 'missing' | 'unknown' {
  if (view === false || blog === false || inf === false) return 'missing';
  if (view === true || blog === true || inf === true) return 'exposed';
  return 'unknown';
}

type MissingCheckRecord = {
  query: string;
  candidates: string[];
  viewExposed: boolean | null;
  viewRank: number | null;
  blogExposed: boolean | null;
  blogRank: number | null;
  infExposed: boolean | null;
  infRank: number | null;
  searchVolume: number;
  status: 'ok' | 'unanalyzable';
  checkedAt: string;
};

/**
 * 검사 결과를 post_missing_checks에 upsert하고, 종합 노출 상태가 이전과 달라졌으면
 * post_missing_history에 전환 이력을 남긴다 (노출→미노출 / 미노출→노출).
 */
async function recordMissingCheck(
  blogId: string,
  postId: string,
  postTitle: string | null,
  rec: MissingCheckRecord,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  // 직전 종합 상태 조회 (전환 판정용)
  const { data: prev } = await supabase
    .from('post_missing_checks')
    .select('view_exposed, blog_exposed, influencer_exposed')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle();

  const prevState = prev
    ? overallExposureState(prev.view_exposed, prev.blog_exposed, prev.influencer_exposed)
    : 'unknown';
  const newState = overallExposureState(rec.viewExposed, rec.blogExposed, rec.infExposed);

  await supabase.from('post_missing_checks').upsert({
    blog_id: blogId,
    post_id: postId,
    post_title: postTitle,
    query: rec.query,
    search_candidates: rec.candidates,
    view_exposed: rec.viewExposed,
    view_rank: rec.viewRank,
    blog_exposed: rec.blogExposed,
    blog_rank: rec.blogRank,
    influencer_exposed: rec.infExposed,
    influencer_rank: rec.infRank,
    search_volume: rec.searchVolume,
    status: rec.status,
    fail_count: 0,
    checked_at: rec.checkedAt,
  }, { onConflict: 'blog_id,post_id' });

  // 노출↔미노출이 실제로 바뀐 경우에만 이력 적재 (첫 확정 검사나 미확인 상태는 이력 남기지 않음)
  if (prevState !== 'unknown' && newState !== 'unknown' && prevState !== newState) {
    const { error: histErr } = await supabase.from('post_missing_history').insert({
      blog_id: blogId,
      post_id: postId,
      post_title: postTitle,
      prev_state: prevState,
      new_state: newState,
      view_exposed: rec.viewExposed,
      blog_exposed: rec.blogExposed,
      influencer_exposed: rec.infExposed,
      changed_at: rec.checkedAt,
    });
    // 이력 저장 실패는 검사 결과 저장에 영향 주지 않음 (테이블 미적용 시에도 기능 동작 유지)
    if (histErr) console.error(`[check-missing] post_missing_history 저장 실패 blogId=${blogId} postId=${postId}:`, histErr);
  }
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
      const cached = await cacheGet<MissingCheckResult>(cacheKey);
      if (cached !== null) {
        // 캐시 히트는 네이버를 치지 않으므로 클라이언트가 대기 없이 다음 키워드로 넘어갈 수 있다.
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // 같은 키에 대해 이미 진행 중인 조회가 있으면 그 결과를 공유 (동시 접속 사용자 간 중복 크롤링 방지)
    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = (async (): Promise<MissingCheckResult> => {
        // 사용자 지정 키워드가 있으면 그대로 사용, 없으면 포스팅 제목 전체(+분리 후보)로 검색
        const displayName = await getDisplayName(blogId);
        const candidates: string[] = keyword && keyword.trim()
          ? [keyword.trim()]
          : buildTitleSearchCandidates(postTitle, blogId, displayName);

        // 검색 후보를 하나도 만들 수 없으면(제목이 전부 노이즈) 검색 자체가 불가능 → 분석불가
        if (candidates.length === 0 || !candidates[0]) {
          return {
            blogTab: { exposed: null, rank: null },
            viewTab: { exposed: null, rank: null },
            influencerTab: { exposed: null, rank: null },
            query: '',
            candidates: [],
            searchVolume: 0,
            status: 'unanalyzable',
            checkedAt: new Date().toISOString(),
          };
        }
        const query = candidates[0];

        // 블로그탭 + 통합검색 + (사용자 지정 키워드 또는 checkInfluencer 명시 요청 시) 인플루언서탭 확인
        // 인플루언서탭 확인은 네이버 요청이 추가로 3페이지 늘어나므로, 필요치 않은 호출(경쟁분석 등)엔 기본 비활성
        const hasKeyword = Boolean(keyword && keyword.trim()) || Boolean(checkInfluencer);

        // 각 탭의 누적 상태. exposed는 노출 확정 시 고정, loaded는 어떤 시도든 정상 응답을 한 번이라도 받으면 true.
        // loaded가 끝까지 false면 = 전 후보의 모든 페이지가 실패 = '일시적 오류'(미노출로 집계하지 않음)
        const blog = { exposed: false, rank: null as number | null, loaded: false };
        const view = { exposed: false, rank: null as number | null, loaded: false };
        const inf = { exposed: false, rank: null as number | null, loaded: false };

        for (let i = 0; i < candidates.length; i++) {
          const allExposed = blog.exposed && view.exposed && (!hasKeyword || inf.exposed);
          if (i > 0 && allExposed) break;
          const cand = candidates[i];
          const [cBlog, cView, cInf] = await Promise.all([
            !blog.exposed ? checkBlogTab(cand, blogId, postId || '') : Promise.resolve({ exposed: true, rank: blog.rank, error: false }),
            !view.exposed ? checkViewTab(cand, blogId, postId || '') : Promise.resolve({ exposed: true, rank: view.rank, error: false }),
            (hasKeyword && !inf.exposed) ? checkInfluencerTab(cand, blogId, postId || '') : Promise.resolve({ exposed: inf.exposed, rank: inf.rank, error: false }),
          ]);
          // 오류가 아니면(정상 응답) loaded 확정. 노출됐으면 순위까지 채택하고 고정.
          if (!blog.exposed && !cBlog.error) { blog.loaded = true; if (cBlog.exposed) { blog.exposed = true; blog.rank = cBlog.rank; } }
          if (!view.exposed && !cView.error) { view.loaded = true; if (cView.exposed) { view.exposed = true; view.rank = cView.rank; } }
          if (hasKeyword && !inf.exposed && !cInf.error) { inf.loaded = true; if (cInf.exposed) { inf.exposed = true; inf.rank = cInf.rank; } }
          if (i < candidates.length - 1) await new Promise(r => setTimeout(r, 300));
        }

        // 탭별 저장값: 노출=true / 정상 확인했으나 못 찾음=false / 확인 실패(일시적 오류)=null
        const blogExposed: boolean | null = blog.exposed ? true : (blog.loaded ? false : null);
        const viewExposed: boolean | null = view.exposed ? true : (view.loaded ? false : null);
        const infExposed: boolean | null = !hasKeyword ? null : (inf.exposed ? true : (inf.loaded ? false : null));

        // 검사한 영역(통합검색·블로그 + 필요 시 인플루언서)이 전부 확인 실패면 '일시적 오류'
        const checkedTabsLoaded = [view.loaded, blog.loaded, ...(hasKeyword ? [inf.loaded] : [])];
        const allErrored = checkedTabsLoaded.every(l => !l);
        const status: 'ok' | 'error' = allErrored ? 'error' : 'ok';

        // 검색량 조회 (순위 공식용) — 오류 상태에선 굳이 추가 호출하지 않음
        const searchVolume = status === 'error' ? 0 : await getSearchVolume(query);

        const freshResult: MissingCheckResult = {
          blogTab: { exposed: blogExposed, rank: blog.rank },
          viewTab: { exposed: viewExposed, rank: view.rank },
          influencerTab: { exposed: infExposed, rank: inf.rank },
          query,
          candidates,
          searchVolume,
          status,
          checkedAt: new Date().toISOString(),
        };

        // 오류 응답은 캐시하지 않는다(다음 시도에서 정상 재확인되도록). 정상 결과만 공유 캐시에 저장.
        if (status !== 'error') {
          await cacheSet(cacheKey, freshResult, CACHE_TTL_SEC);
        }

        // 검사 결과 즉시 DB 반영 (포스트 1개 검사 → 저장, 전체 일괄 계산 방지)
        // ⚠️ 일시적 오류(status='error')는 저장하지 않는다 — 이전의 정상 노출/미노출 기록을 null로 덮어쓰지 않기 위함.
        //    오류는 클라이언트에 응답만 반환하고(UI에 일시적 표시), 다음 재검사 때 정상 확인되면 그때 기록한다.
        if (postId && status !== 'error') {
          try {
            const supabase = createServiceClient();
            await recordMissingCheck(blogId, String(postId), postTitle || null, {
              query,
              candidates,
              viewExposed,
              viewRank: view.rank,
              blogExposed,
              blogRank: blog.rank,
              infExposed,
              infRank: inf.rank,
              searchVolume,
              status,
              checkedAt: freshResult.checkedAt,
            }, supabase);
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
