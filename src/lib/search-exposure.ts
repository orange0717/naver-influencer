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
 * URL: https://search.naver.com/search.naver?query={keyword} (통합검색)
 * VIEW 섹션 내 blog.naver.com 링크를 찾아서 순위 매칭
 */
export async function crawlViewTabRank(
  keyword: string,
  naverIds: string[],
): Promise<SearchExposureResult[]> {
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  const results: SearchExposureResult[] = [];

  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const naverIdSet = new Set(naverIds.map(id => id.toLowerCase()));
    let rank = 0;

    // VIEW 섹션 찾기 (통합검색의 VIEW/블로그 영역)
    // 네이버 통합검색에서 VIEW 섹션은 다양한 클래스명으로 구현됨
    const viewSection = $('div.api_subject_bx').filter((_, el) => {
      const title = $(el).find('.api_title, .title_area').text();
      return title.includes('VIEW') || title.includes('블로그') || title.includes('포스트');
    });

    const searchArea = viewSection.length > 0 ? viewSection : $('body');

    // VIEW 섹션 내 블로그 포스트 링크에서 naver_id 추출
    searchArea.find('a[href*="blog.naver.com"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const blogMatch = href.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
      if (!blogMatch) return;

      // 제목이 있는 링크만 (이미지 링크 등 제외)
      const text = $(el).text().trim();
      if (!text || text.length < 2) return;

      rank++;
      const matchedId = blogMatch[1].toLowerCase();
      if (naverIdSet.has(matchedId)) {
        results.push({ naver_id: blogMatch[1], rank });
      }
    });

    // 중복 제거 (최상위 순위만)
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.naver_id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    console.error(`[search-exposure] 통합검색 VIEW 크롤링 실패 (${keyword}):`, err);
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
