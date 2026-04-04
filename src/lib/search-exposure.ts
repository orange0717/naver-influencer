/**
 * 네이버 통합검색 / 블로그 검색 노출 크롤링
 * - 블로그 검색: where=blog 에서 인플루언서 블로그 포스트 순위 확인
 * - VIEW 탭: 통합검색에서 VIEW 섹션 내 블로그 포스트 순위 확인
 */

import { fetchWithRetry, sleep } from './crawler';

interface SearchExposureResult {
  naver_id: string;
  rank: number; // 1-based
}

/**
 * 블로그 검색에서 인플루언서 포스트 순위 확인
 * URL: https://search.naver.com/search.naver?where=blog&query={keyword}
 */
export async function crawlBlogSearchRank(
  keyword: string,
  naverIds: string[],
): Promise<SearchExposureResult[]> {
  const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so%3Ar%2Cp%3A`;
  const results: SearchExposureResult[] = [];

  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const naverIdSet = new Set(naverIds.map(id => id.toLowerCase()));
    let rank = 0;

    // 블로그 검색 결과의 각 포스트 링크에서 naver_id 추출
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // blog.naver.com/{naver_id} 패턴 매칭
      const blogMatch = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
      if (!blogMatch) return;

      // 검색 결과 항목의 링크인지 확인 (제목 링크)
      const parent = $(el).closest('.title_area, .title_link, .api_txt_lines, .total_tit, .sh_blog_title, .sp_tit, .sub_txt, .detail_box');
      if (!parent.length) {
        // 직접 제목 링크이거나, 검색 결과 구조 내의 링크인 경우도 체크
        const text = $(el).text().trim();
        if (!text || text.length < 2) return;
      }

      rank++;
      const matchedId = blogMatch[1].toLowerCase();
      if (naverIdSet.has(matchedId)) {
        results.push({ naver_id: blogMatch[1], rank });
      }
    });

    // 중복 제거 (같은 naver_id가 여러 포스트에 있을 수 있음 - 최상위 순위만)
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.naver_id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    console.error(`[search-exposure] 블로그 검색 크롤링 실패 (${keyword}):`, err);
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
      const blogMatch = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
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
