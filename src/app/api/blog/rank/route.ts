import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 네이버 블로그탭에서 특정 블로그의 순위를 검색합니다.
 * 1~3페이지(약 30개)까지 확인합니다.
 */
async function searchBlogRank(keyword: string, blogId: string): Promise<{
  rank: number | null;
  totalResults: number;
  blogUrl: string;
  searchUrl: string;
  postTitle: string;
}> {
  const blogIdLower = blogId.toLowerCase();
  const baseUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_blog`;

  let globalRank = 0;
  let foundRank: number | null = null;
  let foundUrl = '';
  let foundTitle = '';
  let totalFound = 0;

  // 1~3페이지 검색
  for (let page = 1; page <= 3; page++) {
    if (foundRank !== null) break;

    const pageUrl = page === 1 ? baseUrl : `${baseUrl}&start=${(page - 1) * 10 + 1}`;

    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://search.naver.com/',
        },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // 블로그 검색 결과 아이템 선택자 (여러 버전 대응)
      const resultSelectors = [
        '.api_txt_lines.fds-comps-right-image',      // 최신 구조
        '.api_txt_lines',                              // 기본 구조
        '.sp_blog .bx',                                // 레거시
        '.total_wrap li',                              // 총합검색
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: cheerio.Cheerio<any> | null = null;
      for (const sel of resultSelectors) {
        const found = $(sel);
        if (found.length > 0) {
          items = found;
          break;
        }
      }

      if (!items || items.length === 0) {
        // 대체: 모든 블로그 링크에서 찾기
        const allBlogLinks: { href: string; title: string; position: number }[] = [];
        const seenHrefs = new Set<string>();

        $('a[href*="blog.naver.com"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const title = $(el).text().trim();
          // 실제 포스트 링크만 (프로필 링크 등 제외)
          if (!seenHrefs.has(href) && title.length > 2 &&
              (href.includes('/PostView') || href.match(/blog\.naver\.com\/[^/]+\/\d+/))) {
            seenHrefs.add(href);
            globalRank++;
            totalFound++;

            if (href.toLowerCase().includes(blogIdLower)) {
              foundRank = globalRank;
              foundUrl = href;
              foundTitle = title;
            }
          }
        });
        continue;
      }

      items.each((_, item) => {
        if (foundRank !== null) return;
        globalRank++;
        totalFound++;

        const el = $(item);

        // 타이틀 링크 찾기
        const titleLink = el.find('.title_link, .api_txt_lines .title_area a, .title_area a, a.title').first();
        const href = titleLink.attr('href') || '';
        const title = titleLink.text().trim();

        // 블로그 이름/URL 영역에서도 찾기
        const subLink = el.find('.sub_txt a, .user_info a, .source_box a, a[href*="blog.naver.com"]').first();
        const subHref = subLink.attr('href') || '';

        const allHrefs = [href, subHref].join(' ').toLowerCase();

        if (allHrefs.includes(`blog.naver.com/${blogIdLower}`) ||
            allHrefs.includes(`blogid=${blogIdLower}`)) {
          foundRank = globalRank;
          foundUrl = href || subHref;
          foundTitle = title;
        }
      });

    } catch {
      continue;
    }

    // 페이지 간 딜레이
    if (page < 3 && foundRank === null) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return {
    rank: foundRank,
    totalResults: totalFound,
    blogUrl: foundUrl,
    searchUrl: baseUrl,
    postTitle: foundTitle,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const blogId = searchParams.get('blogId');

    if (!keyword || !blogId) {
      return NextResponse.json(
        { error: 'keyword와 blogId 파라미터가 필요합니다.' },
        { status: 400 },
      );
    }

    const result = await searchBlogRank(keyword, blogId);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: '순위 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
