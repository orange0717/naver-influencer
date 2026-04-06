/**
 * 네이버 통합검색 / 블로그 검색 노출 크롤링
 * - 블로그 검색: 네이버 검색 API 사용 (정확한 결과)
 * - VIEW 탭: 통합검색에서 VIEW 섹션 내 블로그 포스트 순위 확인
 */

import { fetchWithRetry, sleep } from './crawler';

interface SearchExposureResult {
  naver_id: string;
  rank: number; // 1-based
}

const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

/**
 * 블로그 검색에서 인플루언서 포스트 순위 확인 (네이버 검색 API)
 */
export async function crawlBlogSearchRank(
  keyword: string,
  naverIds: string[],
): Promise<SearchExposureResult[]> {
  const results: SearchExposureResult[] = [];
  const naverIdSet = new Set(naverIds.map(id => id.toLowerCase()));

  try {
    // 네이버 검색 API로 블로그 결과 100개 조회
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
      },
    });

    if (!res.ok) {
      console.error(`[search-exposure] API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data.items || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const link = item.link || '';
      const bloggerlink = item.bloggerlink || '';

      // blog.naver.com/{blogId} 패턴 매칭
      const blogMatch = (link + ' ' + bloggerlink).match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
      if (!blogMatch) continue;

      const matchedId = blogMatch[1].toLowerCase();
      if (naverIdSet.has(matchedId)) {
        results.push({ naver_id: blogMatch[1], rank: i + 1 });
      }
    }

    // 중복 제거 (최상위 순위만)
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.naver_id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    console.error(`[search-exposure] 블로그 검색 API 실패 (${keyword}):`, err);
    return [];
  }
}

/**
 * 통합검색 VIEW 탭에서 인플루언서 포스트 순위 확인
 * 네이버 웹문서 검색 API(webkr.json)로 blog.naver.com 결과 필터링
 */
export async function crawlViewTabRank(
  keyword: string,
  naverIds: string[],
): Promise<SearchExposureResult[]> {
  const results: SearchExposureResult[] = [];
  const naverIdSet = new Set(naverIds.map(id => id.toLowerCase()));

  try {
    const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
      },
    });

    if (!res.ok) {
      console.error(`[search-exposure] 웹문서 API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data.items || [];

    // 블로그 결과만 필터링하여 순위 매기기
    let blogRank = 0;
    for (const item of items) {
      const link = item.link || '';
      const blogMatch = link.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
      if (!blogMatch) continue;

      blogRank++;
      const matchedId = blogMatch[1].toLowerCase();
      if (naverIdSet.has(matchedId)) {
        results.push({ naver_id: blogMatch[1], rank: blogRank });
      }
    }

    // 중복 제거 (최상위 순위만)
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.naver_id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    console.error(`[search-exposure] 통합검색 웹문서 API 실패 (${keyword}):`, err);
    return [];
  }
}

/**
 * 키워드에 대해 블로그 검색 + 통합검색 VIEW 노출을 한번에 크롤링
 */
export async function crawlSearchExposure(
  keyword: string,
  naverIds: string[],
): Promise<{
  blog: SearchExposureResult[];
  view: SearchExposureResult[];
}> {
  const blog = await crawlBlogSearchRank(keyword, naverIds);
  await sleep(1500); // 요청 간 딜레이
  const view = await crawlViewTabRank(keyword, naverIds);
  return { blog, view };
}

/**
 * 인플루언서 페이지(in.naver.com/{naverId})에서 블로그 ID 추출
 * naver_id와 blog_id가 다른 경우가 많음 (예: orangelibrary → orangelibrary_)
 */
export async function extractBlogIdFromInfluencerPage(
  naverId: string,
): Promise<string | null> {
  try {
    const url = `https://in.naver.com/${naverId}`;
    const res = await fetchWithRetry(url);
    const html = await res.text();

    // blog.naver.com/{blogId} 패턴 추출 (influencer_search 등 시스템 ID 제외)
    const allMatches = [...html.matchAll(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/g)];
    const validIds = allMatches
      .map(m => m[1])
      .filter(id => id !== 'influencer_search');

    // naver_id와 다른 blog ID 우선 반환 (실제 블로그 ID)
    const differentId = validIds.find(id => id.toLowerCase() !== naverId.toLowerCase());
    if (differentId) return differentId;

    // 동일해도 반환
    if (validIds.length > 0) return validIds[0];
    return null;
  } catch (err) {
    console.error(`[search-exposure] 블로그 ID 추출 실패 (${naverId}):`, err);
    return null;
  }
}
