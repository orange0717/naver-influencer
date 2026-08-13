/**
 * 네이버 공식 블로그 검색 API — 교차검증 "보조 채널"(§6·§23).
 *
 * 역할: HTML 검색결과(SERP) 파싱이 1차 정답(사용자가 실제 보는 화면)이고,
 * 이 공식 API는 "그 글이 네이버 블로그 검색 색인에 실제로 존재하는가"를 독립적으로 확인하는
 * 두 번째 눈이다. HTML 이 블로그탭 미노출로 판정했을 때만 보조 조회해(비용 절감), 공식 색인엔
 * 존재한다면 "한 곳이라도 노출 → 노출"(§10) 원칙에 따라 오탐(실제 노출인데 미노출)을 걸러낸다.
 *
 * §23 추상화: 특정 API URL/응답 구조를 판정·화면 로직에 하드코딩하지 않는다. 향후 네이버 검색 API가
 * NAVER API HUB 로 이관되면 이 파일의 Provider 구현만 교체하면 되고, 호출측은 그대로 둔다.
 */

const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

export interface BlogSearchHit {
  /** 검색 결과의 실제 포스팅 URL */
  postUrl: string;
  /** URL 에서 파싱한 blogId(핸들) */
  blogId: string;
  /** URL 에서 파싱한 postId(logNo). 없으면 null */
  postId: string | null;
  /** 검색 결과 내 위치(1-base) */
  rank: number;
}

/** 블로그 검색 제공자 추상 인터페이스 — 공식 API / (향후) API HUB / 목업이 모두 구현 */
export interface BlogSearchProvider {
  readonly name: string;
  /** 크리덴셜 등 사용 가능 조건 충족 여부 */
  isAvailable(): boolean;
  /** query 로 블로그 검색 후 상위 결과의 (URL·blogId·postId·rank) 목록 반환. error=true 는 조회 실패(≠결과 없음) */
  search(query: string, limit?: number): Promise<{ hits: BlogSearchHit[]; error: boolean }>;
}

/** blog.naver.com/{blogId}/{postId} 또는 {blogId}?logNo={postId} 형태에서 (blogId, postId) 추출 */
function parseBlogUrl(url: string): { blogId: string; postId: string | null } | null {
  if (!url) return null;
  const m = url.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
  if (m) return { blogId: m[1], postId: m[2] };
  const m2 = url.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (m2) {
    const logNo = url.match(/[?&]logNo=(\d+)/);
    return { blogId: m2[1], postId: logNo ? logNo[1] : null };
  }
  return null;
}

/** 네이버 공식 블로그 검색 OpenAPI (openapi.naver.com/v1/search/blog.json) 구현 */
export class NaverOfficialBlogSearchProvider implements BlogSearchProvider {
  readonly name = 'naver-official-blog-api';

  isAvailable(): boolean {
    return Boolean(NAVER_SEARCH_CLIENT_ID && NAVER_SEARCH_CLIENT_SECRET);
  }

  async search(query: string, limit = 30): Promise<{ hits: BlogSearchHit[]; error: boolean }> {
    if (!this.isAvailable() || !query.trim()) return { hits: [], error: true };
    const display = Math.min(Math.max(limit, 1), 100);
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;
    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
        },
      });
      if (!res.ok) {
        console.warn(`[naver-blog-search-api] 응답 비정상 status=${res.status} query="${query}"`);
        return { hits: [], error: true };
      }
      const data = await res.json();
      const items: { link?: string; bloggerlink?: string }[] = data.items || [];
      const hits: BlogSearchHit[] = [];
      items.forEach((item, i) => {
        const parsed = parseBlogUrl(item.link || '') || parseBlogUrl(item.bloggerlink || '');
        if (parsed) hits.push({ postUrl: item.link || '', blogId: parsed.blogId, postId: parsed.postId, rank: i + 1 });
      });
      return { hits, error: false };
    } catch (err) {
      console.error(`[naver-blog-search-api] 예외 query="${query}":`, err);
      return { hits: [], error: true };
    }
  }
}

/** 현재 활성 제공자 — API HUB 이관 시 이 한 줄만 교체 */
export const activeBlogSearchProvider: BlogSearchProvider = new NaverOfficialBlogSearchProvider();

export interface CorroborateResult {
  /** 공식 채널에서 내 글이 확인됨 */
  exposed: boolean;
  rank: number | null;
  /** 조회 자체 실패(일시적/미설정) — 미노출 근거로 쓰면 안 됨(§15) */
  error: boolean;
  matchedUrl: string | null;
  /** 근거 출처(§13) */
  source: string;
}

/**
 * 공식 블로그 검색 API 로 "내 포스팅"이 검색 색인에 존재하는지 교차 확인한다(§6).
 * 매칭 기준(§16): postId(logNo)가 주어지면 blogId+postId 정확 일치, 없으면 blogId 일치.
 * 제목 유사도만으로 남의 글을 내 글로 오인하지 않는다.
 */
export async function corroborateBlogExposure(
  query: string,
  blogId: string,
  postId?: string,
  provider: BlogSearchProvider = activeBlogSearchProvider,
): Promise<CorroborateResult> {
  const source = provider.name;
  if (!provider.isAvailable()) return { exposed: false, rank: null, error: true, matchedUrl: null, source };

  const { hits, error } = await provider.search(query, 30);
  if (error) return { exposed: false, rank: null, error: true, matchedUrl: null, source };

  const blogIdLower = blogId.toLowerCase();
  const postIdStr = postId ? String(postId) : '';
  for (const hit of hits) {
    if (hit.blogId.toLowerCase() !== blogIdLower) continue;
    // postId 가 있으면 정확 일치를 요구(다른 글 오인 방지). 없으면 blogId 일치로 인정.
    if (postIdStr && hit.postId && hit.postId !== postIdStr) continue;
    return { exposed: true, rank: hit.rank, error: false, matchedUrl: hit.postUrl || `https://blog.naver.com/${blogId}/${postId ?? ''}`, source };
  }
  return { exposed: false, rank: null, error: false, matchedUrl: null, source };
}
