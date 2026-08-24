import * as cheerio from 'cheerio';
import { createHmac } from 'crypto';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

// 순위 결과 공유 캐시 (Redis, 인스턴스·기기 간 공유 / 10분 — 자동 새로고침 주기와 일치)
export const CACHE_TTL_SEC = 10 * 60;

// 검색량 공유 캐시 (24시간)
const VOLUME_CACHE_TTL_SEC = 24 * 60 * 60;

// 검색 결과 HTML 공유 캐시 (스펙 #24: 같은 키워드를 여러 포스팅이 조회할 때 네이버 요청 1회를 재사용).
// 매칭(포스팅별 순위 계산)은 캐시된 HTML을 각 포스팅별로 다시 파싱하므로 정확도에 영향 없음.
// TTL은 짧게(3분) — 순위가 실시간에 가깝게 유지되도록. force=true면 캐시를 건너뛴다.
const HTML_CACHE_TTL_SEC = 3 * 60;
const HTML_CACHE_MAX_BYTES = 500_000; // 과도한 Redis 사용 방지

export interface TabFetchOpts {
  /** true면 HTML 공유 캐시를 건너뛰고 네이버에서 강제 재조회 */
  force?: boolean;
  /**
   * 인플루언서 콘텐츠(in.naver.com/{handle}) 매칭용 핸들(=naver_id). blog_id 와 다를 수 있어
   * (예: 블로그 orangelibrary_ ↔ 인플루언서 handle orangelibrary) 별도로 받는다.
   * 미지정 시 blog_id 와 blog_id 의 뒤 '_' 제거형까지 허용한다.
   */
  influencerHandle?: string;
}

/** in.naver 콘텐츠 매칭에 허용할 핸들 집합 — blog_id, 뒤 '_' 제거형, 명시된 influencerHandle */
function buildHandleSet(blogId: string, influencerHandle?: string): Set<string> {
  const s = new Set<string>();
  const b = blogId.toLowerCase();
  if (b) { s.add(b); s.add(b.replace(/_+$/, '')); }
  if (influencerHandle) s.add(influencerHandle.toLowerCase());
  s.delete('');
  return s;
}

/** 검색 결과 컨테이너 — 통합검색·블로그탭·인플루언서탭이 모두 갖고 있다(2026-08-24 3면 실측). */
const SEARCH_RESULT_CONTAINER_REGEX = /id=["']main_pack["']/;

/** 네이버 응답 대기 상한 — 없으면 한 요청이 배치 전체를 무한정 붙잡는다. */
const SEARCH_FETCH_TIMEOUT_MS = 15_000;

/**
 * 받아온 HTML이 "정상적으로 렌더된 검색 결과 페이지"인지 확인한다.
 *
 * 네이버는 자동화 차단·보안문자·점검 상황에서도 HTTP 200으로 안내 페이지를 내려준다.
 * 따라서 상태코드만 믿으면 결과를 0건 파싱하고도 "상위 N위 내 매칭 없음"으로 확정해버려,
 * 확인하지 못한 것이 미노출로 굳는다(이 파일이 막아야 할 오판의 핵심 경로).
 *
 * 판정은 결과 컨테이너 존재 여부로만 한다. 안내/차단 페이지는 이 골격 자체가 없다.
 * 본문 문구 매칭은 일부러 쓰지 않는다 — 정상 검색 페이지의 인라인 스크립트에도
 * '일시적인 오류가 발생' 같은 안내 문자열이 들어 있어, raw HTML 문자열 검색으로는
 * 정상 응답을 통째로 오류 처리하게 된다(2026-08-24 통합검색·인플탭에서 실측 확인).
 */
function isSearchResultPage(html: string): boolean {
  return SEARCH_RESULT_CONTAINER_REGEX.test(html);
}

/**
 * 검색 결과 페이지 HTML을 가져온다. 같은 URL(=같은 키워드·탭·페이지)은 짧은 TTL 동안 공유 캐시에서 재사용(스펙 #24).
 * 반환 null = 응답 비정상/차단/네트워크 오류(호출측이 '일시적 오류'로 처리).
 */
async function fetchSearchHtml(url: string, opts?: TabFetchOpts): Promise<string | null> {
  const cacheKey = `srchhtml:${url}`;
  if (!opts?.force) {
    const cached = await cacheGet<string>(cacheKey);
    // 차단 페이지가 캐시에 남아 있으면 TTL 동안 같은 배치의 모든 포스팅이 함께 오판된다.
    if (cached !== null && isSearchResultPage(cached)) return cached;
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': 'https://search.naver.com/',
    },
    signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const html = await res.text();
  if (!isSearchResultPage(html)) {
    console.warn(`[keyword-rank-check] 검색 결과 페이지 아님(차단/점검 추정) → 일시적 오류 처리 url=${url} len=${html.length}`);
    return null;
  }
  if (html.length <= HTML_CACHE_MAX_BYTES) {
    await cacheSet(cacheKey, html, HTML_CACHE_TTL_SEC);
  }
  return html;
}

// 탭 조회 결과 — error:true = 전 페이지 로드 실패(일시적 오류). 미노출(exposed:false)과 구분해야 오판을 막는다.
//   scannedDepth = "조회 범위 밖"(스펙 #10/#21) 판정용 — 조회 성공했으나 미발견 시 확인한 상위 순위 범위(예: 30).
//   exposed=false && scannedDepth 존재 → "N위 밖", scannedDepth 없으면 일반 미노출.
export type TabCheckResult = { exposed: boolean; rank: number | null; error?: boolean; scannedDepth?: number };

export type RankCheckResult = {
  blogTab: TabCheckResult;
  viewTab: TabCheckResult;
  influencerTab: TabCheckResult;
  query: string;
  // 이번 검사에서 실제로 시도한 검색 후보 전체(제목 기반, 1~4개) — 상세 화면 표시용. check-missing API에서만 채움
  candidates?: string[];
  searchVolume: number;
  checkedAt: string;
};

// 인플루언서 handle에는 점이 들어갈 수 있다(simple.arti). 점을 빼면 그 항목이 통째로 안 잡혀
// 뒤 순위가 그만큼 당겨진다 — "한국소설" 2위 글이 1위로 표시되던 원인.
const IN_CONTENT_REGEX_SOURCE = () => /in\.naver\.com\/([a-zA-Z0-9_.-]+)\/contents\/internal\/(\d+)/g;

/**
 * 신형 인플루언서 콘텐츠(in.naver.com/{handle}/contents/internal/{id}) 링크를 등장 순서로 세어
 * handle 이 handles 집합(blog_id·naver_id 등)에 속하는 첫 항목의 순위를 반환한다. 없으면 null.
 * 신형 마크업엔 data-cr-on="r=" 순위 속성이 없어 DOM 등장 순서를 순위로 사용한다.
 * (blog logNo ↔ 인플루언서 contentId는 체계가 달라 글 단위 정밀 매칭은 불가 — handle 기준 근사)
 */
export function matchInfluencerContentByHandle(html: string, handles: Set<string>, rankBase: number): number | null {
  const inRegex = IN_CONTENT_REGEX_SOURCE();
  const seen = new Set<string>();
  let rank = rankBase;
  let m;
  while ((m = inRegex.exec(html)) !== null) {
    const handle = m[1];
    const contentId = m[2];
    const key = `${handle}/${contentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rank++;
    if (handles.has(handle.toLowerCase())) {
      return rank;
    }
  }
  return null;
}

/**
 * 네이버 블로그탭에서 포스팅 노출 여부 확인
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위를 추출 (정확도 높음)
 * 폴백: <a> href에서 blog.naver.com 링크 수동 카운트
 */
export async function checkBlogTab(query: string, blogId: string, postId: string, opts?: TabFetchOpts): Promise<TabCheckResult> {
  // 블로그탭은 blogId+postId 정밀 매칭이 유일한 판정 수단이다. 둘 중 하나라도 없으면
  // 조회를 해봐야 매칭이 성립하지 않으므로 '미노출'이 아니라 '확인 불가'다.
  if (!blogId || !postId) {
    return { exposed: false, rank: null, error: true };
  }

  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId);
  const baseUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

  // 한 페이지라도 정상 로드됐는지 추적 — 전 페이지가 실패하면 "미노출"이 아니라 "일시적 오류"로 신호한다
  // (네이버 다운/차단으로 인한 오탐을 미노출로 잘못 집계하지 않기 위함)
  let anyPageLoaded = false;
  let pagesLoaded = 0; // "조회 범위 밖"(스펙 #10) 판정용 — 정상 로드된 페이지 수 × 10 = 확인한 상위 순위 범위

  for (let page = 1; page <= 3; page++) {
    const start = (page - 1) * 10 + 1;
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}&start=${start}`;

    try {
      const html = await fetchSearchHtml(pageUrl, opts);
      if (html === null) {
        console.warn(`[keyword-rank-check] checkBlogTab 네이버 응답 비정상 query="${query}" blogId=${blogId} postId=${postId} page=${page}`);
        continue;
      }

      anyPageLoaded = true;
      pagesLoaded++;

      // 1순위: data-cr-on 속성에서 네이버 공식 순위 추출
      // 패턴: data-url="https://blog.naver.com/blogId/postId" ... data-cr-on="r=순위"
      // 주의: r= 값은 페이지 내 상대 순위이므로, 페이지 번호를 반영해 절대 순위로 변환
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set<string>();
      let match;

      while ((match = rankRegex.exec(html)) !== null) {
        const [, linkBlogId, linkPostId, rankStr] = match;
        const key = `${linkBlogId}/${linkPostId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (linkBlogId.toLowerCase() === blogIdLower && linkPostId === postIdStr) {
          // r= 값은 페이지 내 상대 순위이므로, start + rank - 1로 절대 순위 계산
          const absoluteRank = start + parseInt(rankStr) - 1;
          return { exposed: true, rank: absoluteRank };
        }
      }

      // 2순위 폴백: <a> href에서 수동 카운트 (data-cr-on 없는 경우)
      if (seen.size === 0) {
        const $ = cheerio.load(html);
        const blogLinks: { blogId: string; postId: string }[] = [];
        const seenFb = new Set<string>();
        let globalRank = (page - 1) * 10;

        $('a').each((_, el) => {
          const href = $(el).attr('href') || '';
          const m = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
          if (!m) return;
          const key = `${m[1]}/${m[2]}`;
          if (seenFb.has(key)) return;
          seenFb.add(key);
          blogLinks.push({ blogId: m[1], postId: m[2] });
        });

        for (const link of blogLinks) {
          globalRank++;
          if (link.blogId.toLowerCase() === blogIdLower && link.postId === postIdStr) {
            return { exposed: true, rank: globalRank };
          }
        }
      }
    } catch (err) {
      console.error(`[keyword-rank-check] checkBlogTab 예외 query="${query}" blogId=${blogId} postId=${postId} page=${page}:`, err);
      continue;
    }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  if (!anyPageLoaded) {
    console.warn(`[keyword-rank-check] checkBlogTab 전 페이지 로드 실패 → 일시적 오류 query="${query}" blogId=${blogId} postId=${postId}`);
    return { exposed: false, rank: null, error: true };
  }
  console.info(`[keyword-rank-check] checkBlogTab 미노출 판정 query="${query}" blogId=${blogId} postId=${postId} (상위 ${pagesLoaded * 10}위 내 매칭 없음)`);
  // 정상 조회했으나 확인 범위(상위 pagesLoaded*10위) 내 미발견 → "조회 범위 밖"(스펙 #10/#21)
  return { exposed: false, rank: null, scannedDepth: pagesLoaded * 10 };
}

/**
 * 네이버 인플루언서탭에서 포스팅 노출 여부 확인
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위를 추출 (정확도 높음)
 * 폴백: <a> href에서 blog.naver.com 링크 수동 카운트
 * (URL 구조·파싱 로직은 /api/keywords/blog-top의 crawlInfluencerTab과 동일 사이트 렌더링을 사용)
 */
export async function checkInfluencerTab(query: string, blogId: string, postId: string, opts?: TabFetchOpts): Promise<TabCheckResult> {
  // 인플루언서 콘텐츠는 in.naver.com handle 기준으로 매칭하므로 postId가 없어도 조회 가능.
  if (!blogId) {
    return { exposed: false, rank: null };
  }

  const blogIdLower = blogId.toLowerCase();
  const handleSet = buildHandleSet(blogId, opts?.influencerHandle);
  const postIdStr = String(postId || '');
  // 인플루언서 탭도 통합검색과 마찬가지로 &start= 파라미터를 무시하고 항상 1페이지 결과를 반환한다
  // (scripts/probe-influencer-tab.mjs로 확증 — page1=page2=page3 동일). 과거엔 이를 페이지2/3으로 오인해
  // start/(page-1)*10 오프셋을 더해, 실제 2위 글을 15/18위로 부풀리는 버그가 있었다.
  // 따라서 1페이지만 조회하고 등장순서/r= 값을 그대로 순위로 사용한다.
  const baseUrl = `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

  let html: string | null = null;
  try {
    html = await fetchSearchHtml(baseUrl, opts);
    if (html === null) {
      console.warn(`[keyword-rank-check] checkInfluencerTab 네이버 응답 비정상 query="${query}" blogId=${blogId} postId=${postId}`);
      return { exposed: false, rank: null, error: true };
    }

    // 신형 인플루언서 탭(fender-ui SDS)은 결과가 in.naver.com/{handle}/contents/internal/{id} 링크로 노출되고
    // data-cr-on="r=" 순위 속성이 없다. 등장 순서(dedupe 후)를 순위로 사용하고 handle(blog_id·naver_id)로 매칭한다.
    const inRank = matchInfluencerContentByHandle(html, handleSet, 0);
    if (inRank !== null) {
      return { exposed: true, rank: inRank };
    }

    // 폴백1: 구형/혼합 마크업 — data-url=blog.naver.com + data-cr-on="r=" 정밀 매칭 (postId 필요). r= 는 절대순위이므로 그대로 사용.
    if (postIdStr) {
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set<string>();
      let match;
      while ((match = rankRegex.exec(html)) !== null) {
        const [, linkBlogId, linkPostId, rankStr] = match;
        const key = `${linkBlogId}/${linkPostId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (linkBlogId.toLowerCase() === blogIdLower && linkPostId === postIdStr) {
          return { exposed: true, rank: parseInt(rankStr) };
        }
      }

      // 폴백2: <a> href에서 blog.naver.com 수동 카운트 (1페이지 등장순서)
      const $ = cheerio.load(html);
      const seenFb = new Set<string>();
      let globalRank = 0;
      let found: number | null = null;
      $('a').each((_, el) => {
        if (found !== null) return;
        const href = $(el).attr('href') || '';
        const m = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
        if (!m) return;
        const key = `${m[1]}/${m[2]}`;
        if (seenFb.has(key)) return;
        seenFb.add(key);
        globalRank++;
        if (m[1].toLowerCase() === blogIdLower && m[2] === postIdStr) {
          found = globalRank;
        }
      });
      if (found !== null) {
        return { exposed: true, rank: found };
      }
    }
  } catch (err) {
    console.error(`[keyword-rank-check] checkInfluencerTab 예외 query="${query}" blogId=${blogId} postId=${postId}:`, err);
    return { exposed: false, rank: null, error: true };
  }

  console.info(`[keyword-rank-check] checkInfluencerTab 미노출 판정 query="${query}" blogId=${blogId} postId=${postId} (인플루언서 1페이지 내 매칭 없음)`);
  // "조회 범위 밖" 판정용: 이 페이지에서 확인한 인플루언서 콘텐츠 개수를 스캔 깊이로 기록(0이면 미기록)
  const inCount = html ? countInfluencerEntries(html) : 0;
  return inCount > 0
    ? { exposed: false, rank: null, scannedDepth: inCount }
    : { exposed: false, rank: null };
}

/** 인플루언서탭 결과에서 서로 다른 in.naver.com 콘텐츠 개수 — 조회 범위(스캔 깊이) 산정용 */
function countInfluencerEntries(html: string): number {
  const inRegex = IN_CONTENT_REGEX_SOURCE();
  const seen = new Set<string>();
  let m;
  while ((m = inRegex.exec(html)) !== null) seen.add(`${m[1]}/${m[2]}`);
  return seen.size;
}

/**
 * 네이버 통합검색(VIEW) — 검색 결과 페이지 직접 파싱
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위 추출
 */
export async function checkViewTab(query: string, blogId: string, postId?: string, maxPages: number = 3, opts?: TabFetchOpts): Promise<TabCheckResult> {
  // 인플루언서 콘텐츠(in.naver.com)는 handle 기준으로 매칭하므로 postId가 없어도 조회 가능.
  if (!blogId) {
    return { exposed: false, rank: null };
  }

  const blogIdLower = blogId.toLowerCase();
  const handleSet = buildHandleSet(blogId, opts?.influencerHandle);
  const postIdStr = String(postId || '');
  // 네이버 통합검색(where=webkr)은 &start= 파라미터를 무시하고 항상 1페이지 결과를 반환하며,
  // data-cr-on="r=" 값이 이미 최종(절대) 순위다. 과거엔 이를 페이지2/3으로 오인해 start 오프셋(+10/+20)을
  // 이중 가산해, 실제 8위 글을 18/28위로 부풀리는 버그가 있었다(scripts/probe-rank-offset.mjs로 확증).
  // 따라서 통합검색은 1페이지만 조회하고 r= 값을 그대로 순위로 사용한다.
  // maxPages는 이제 "webkr OpenAPI 폴백 사용 여부(정밀조회=3 / 스크리닝=1)" 플래그로만 쓴다.
  const baseUrl = `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(query)}`;

  // "조회 범위 밖"(스펙 #10) 스캔 깊이 — 통합검색 HTML 1페이지는 통상 상위 30위 범위. webkr OpenAPI 폴백(display=100)까지 쓰면 100.
  let scannedDepth = 30;
  try {
    const html = await fetchSearchHtml(baseUrl, opts);
    if (html === null) {
      // 단일 페이지 조회이므로 이 페이지 실패 = 조회 실패 → 미노출로 오판하지 않고 일시적 오류로 신호(스펙 #8)
      console.warn(`[keyword-rank-check] checkViewTab 네이버 응답 비정상 query="${query}" blogId=${blogId} postId=${postId}`);
      return { exposed: false, rank: null, error: true };
    }

    // 블로그 포스트 링크 추출: data-url="..." data-cr-on="r=..." (postId 정밀 매칭 우선)
    // r= 값은 이미 절대순위이므로 페이지 오프셋을 더하지 않고 그대로 사용한다.
    if (postIdStr) {
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set<string>();
      let match;

      while ((match = rankRegex.exec(html)) !== null) {
        const [, linkBlogId, linkPostId, rankStr] = match;
        const key = `${linkBlogId}/${linkPostId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (linkBlogId.toLowerCase() === blogIdLower && linkPostId === postIdStr) {
          return { exposed: true, rank: parseInt(rankStr) };
        }
      }
    }

    // 인플루언서 콘텐츠(in.naver.com)로 통합검색에 노출된 경우 — handle 기준 등장순서 매칭(1페이지 기준)
    const inRank = matchInfluencerContentByHandle(html, handleSet, 0);
    if (inRank !== null) {
      return { exposed: true, rank: inRank };
    }

    // 2순위 폴백: webkr OpenAPI(display=100, 절대순위). 스크리닝(maxPages=1)에선 API 쿼터 절약 위해 건너뜀.
    if (postIdStr && maxPages > 1 && NAVER_SEARCH_CLIENT_ID && NAVER_SEARCH_CLIENT_SECRET) {
      try {
        const apiUrl = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=100`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
          },
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          const items = apiData.items || [];
          scannedDepth = 100; // API 폴백까지 확인 → 조회 범위를 상위 100위로 확장
          let rank = 0;
          for (const item of items) {
            const link = item.link || '';
            const blogMatch = link.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
            if (!blogMatch) continue;
            rank++;
            if (blogMatch[1].toLowerCase() === blogIdLower && blogMatch[2] === postIdStr) {
              return { exposed: true, rank };
            }
          }
        }
      } catch (err) {
        console.error(`[keyword-rank-check] checkViewTab webkr API 폴백 실패 query="${query}":`, err);
      }
    }
  } catch (err) {
    console.error(`[keyword-rank-check] checkViewTab 예외 query="${query}" blogId=${blogId} postId=${postId}:`, err);
    return { exposed: false, rank: null, error: true };
  }

  console.info(`[keyword-rank-check] checkViewTab 미노출 판정 query="${query}" blogId=${blogId} postId=${postId} (통합검색 상위 ${scannedDepth}위 내 매칭 없음, webkr API ${NAVER_SEARCH_CLIENT_ID ? '사용가능' : '미설정'})`);
  // 정상 조회했으나 확인 범위(상위 scannedDepth위) 내 미발견 → "조회 범위 밖"(스펙 #10/#21)
  return { exposed: false, rank: null, scannedDepth };
}

/**
 * 키워드 검색량 조회 (네이버 Search Ads API)
 * 24시간 캐시로 불필요한 호출 최소화
 */
export async function getSearchVolume(keyword: string): Promise<number> {
  const cacheKey = keyword.trim().toLowerCase();
  const cached = await cacheGet<number>(`vol:${cacheKey}`);
  if (cached !== null) return cached;

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) {
    console.warn(`[keyword-rank-check] 검색량 조회 불가: 네이버 검색광고 API 환경변수 미설정 (keyword="${keyword}") — 순위와 별개로 항상 0/--로 표시됨`);
    return 0;
  }

  try {
    const timestamp = String(Date.now());
    const message = `${timestamp}.GET./keywordstool`;
    const signature = createHmac('sha256', secretKey).update(message).digest('base64');

    const url = `https://api.searchad.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': signature,
      },
    });

    if (!res.ok) {
      console.warn(`[keyword-rank-check] 검색량 조회 실패 status=${res.status} keyword="${keyword}" — 네이버 검색광고 API 응답 비정상`);
      return 0;
    }
    const data = await res.json();
    const keywords = data.keywordList || [];

    // 정확히 일치하는 키워드의 검색량 찾기
    const exact = keywords.find((kw: Record<string, unknown>) =>
      String(kw.relKeyword).trim().toLowerCase() === cacheKey
    );

    let volume = 0;
    if (exact) {
      const pc = typeof exact.monthlyPcQcCnt === 'number' ? exact.monthlyPcQcCnt : 0;
      const mobile = typeof exact.monthlyMobileQcCnt === 'number' ? exact.monthlyMobileQcCnt : 0;
      volume = pc + mobile;
    } else if (keywords.length > 0) {
      // 정확히 일치하지 않으면 첫 번째 결과 사용
      const first = keywords[0];
      const pc = typeof first.monthlyPcQcCnt === 'number' ? first.monthlyPcQcCnt : 0;
      const mobile = typeof first.monthlyMobileQcCnt === 'number' ? first.monthlyMobileQcCnt : 0;
      volume = pc + mobile;
    }

    // 캐시 저장 (24시간, 공유)
    await cacheSet(`vol:${cacheKey}`, volume, VOLUME_CACHE_TTL_SEC);

    return volume;
  } catch (err) {
    console.error(`[keyword-rank-check] 검색량 조회 예외 keyword="${keyword}":`, err);
    return 0;
  }
}
