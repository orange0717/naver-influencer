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

/**
 * 포스팅 제목에서 핵심 키워드 추출
 * - 블로그 이름/닉네임/displayName 제거
 * - 한국어 조사 분리 (블로그의→블로그, 미래는→미래)
 * - 복합어 분리
 * - 불용어 제거
 * - 핵심 명사 2~3개 추출
 */
function extractKeywords(title: string, blogId: string, displayName?: string): string {
  let cleaned = title;
  // 1. blogId + displayName + 닉네임 변형 제거
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) {
    removePatterns.push(displayName);
    if (displayName.length >= 4) {
      removePatterns.push(displayName.slice(0, Math.ceil(displayName.length / 2)));
    }
  }
  const suffixes = ['단상', '도서관', '지음', '블로그', '일기', '기록', '이야기', '스토리'];
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(p, 'gi'), ' ');
  }
  for (const s of suffixes) {
    if (displayName && cleaned.toLowerCase().includes(displayName.slice(0, 3).toLowerCase() + s)) {
      cleaned = cleaned.replace(new RegExp(displayName.slice(0, 3) + s, 'gi'), ' ');
    }
  }
  // 2. 괄호 제거
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // 3. 복합어 분리 (의미 단위가 붙어있는 경우만)
  cleaned = cleaned.replace(/([가-힣]{2,})(명대사|명언|글귀|해석|도서관|지음|런칭|소식|업데이트|참여|강의|모집|발행)/g, '$1 $2');
  // 4. 특수문자 제거 + 분리
  const rawWords = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // 5. 조사 제거 + 불용어 필터
  const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
  const words = rawWords
    .map(w => /^[가-힣]+$/.test(w) ? stripParticles(w) : w)
    .filter(w => w.length >= 1 && !stop.has(w) && !/^\d+$/.test(w) && !/^[a-zA-Z]$/.test(w));
  return words.slice(0, 3).join(' ') || title.slice(0, 20);
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
    const { blogId, postTitle, postId, keyword, force } = body;

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
        // 사용자 지정 키워드가 있으면 그대로 사용, 없으면 자동 추출
        const displayName = await getDisplayName(blogId);
        let query: string;
        if (keyword && keyword.trim()) {
          query = keyword.trim();
        } else {
          query = extractKeywords(postTitle, blogId, displayName);
        }

        // 블로그탭 + 통합검색 + (사용자 지정 키워드인 경우만) 인플루언서탭 동시 확인
        // 인플루언서탭은 /my/keyword-ranking(사용자 키워드 지정) 전용 — 자동추출 제목 기반 확인(경쟁분석 등)에는 불필요
        const hasKeyword = Boolean(keyword && keyword.trim());
        const [blogTabResult, viewTabResult, influencerTab] = await Promise.all([
          checkBlogTab(query, blogId, postId || ''),
          checkViewTab(query, blogId, postId || ''),
          hasKeyword ? checkInfluencerTab(query, blogId, postId || '') : Promise.resolve({ exposed: false, rank: null }),
        ]);
        let blogTab = blogTabResult;
        let viewTab = viewTabResult;

        // 폴백: 사용자 키워드가 아닌 경우 여러 쿼리 조합으로 재시도
        if (!keyword && (!blogTab.exposed || !viewTab.exposed)) {
          // 원본 제목에서 추가 후보 쿼리 생성
          const fallbackCandidates: string[] = [];

          // 후보 1: 단어 2개 (가장 긴 단어 2개 조합 — 더 구체적)
          let cleaned = postTitle;
          if (displayName && displayName.length >= 2) {
            cleaned = cleaned.replace(new RegExp(displayName, 'gi'), ' ');
          }
          cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
          const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
          const words2 = cleaned.split(/\s+/).filter((w: string) => w.length >= 2 && !stop.has(w) && !/^\d+$/.test(w));
          const byLength = [...words2].sort((a, b) => b.length - a.length);
          if (byLength.length >= 2) fallbackCandidates.push(byLength.slice(0, 2).join(' '));
          if (byLength.length >= 1) fallbackCandidates.push(byLength[0]);

          // 후보 2: 원본 제목 앞 30자
          const rawTitle = postTitle.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
          if (rawTitle.length >= 4 && rawTitle !== query) {
            fallbackCandidates.push(rawTitle.length > 30 ? rawTitle.slice(0, 30) : rawTitle);
          }

          for (const fb of fallbackCandidates) {
            if (fb === query || fb.length < 2) continue;
            if (blogTab.exposed && viewTab.exposed) break;
            const [fbBlog, fbView] = await Promise.all([
              !blogTab.exposed ? checkBlogTab(fb, blogId, postId || '') : Promise.resolve(blogTab),
              !viewTab.exposed ? checkViewTab(fb, blogId, postId || '') : Promise.resolve(viewTab),
            ]);
            if (fbBlog.exposed) blogTab = fbBlog;
            if (fbView.exposed) viewTab = fbView;
            if (blogTab.exposed && viewTab.exposed) break;
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // 검색량 조회 (순위 공식용)
        const searchVolume = await getSearchVolume(query);

        const freshResult: RankCheckResult = {
          blogTab: { exposed: blogTab.exposed, rank: blogTab.rank },
          viewTab: { exposed: viewTab.exposed, rank: viewTab.rank },
          influencerTab: { exposed: influencerTab.exposed, rank: influencerTab.rank },
          query,
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
              view_exposed: viewTab.exposed,
              view_rank: viewTab.rank,
              blog_exposed: blogTab.exposed,
              blog_rank: blogTab.rank,
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
