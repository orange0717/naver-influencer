import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 네이버 블로그탭에서 특정 블로그의 순위를 검색합니다.
 * 블로그탭은 순수 블로그 결과만 표시하므로 정확한 순위를 알 수 있습니다.
 */
async function searchBlogRank(keyword: string, blogId: string): Promise<{
  rank: number | null;
  totalResults: number;
  blogUrl: string;
  searchUrl: string;
}> {
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so%3Add%2Cp%3A1m`;

  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) {
      return { rank: null, totalResults: 0, blogUrl: '', searchUrl };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // 블로그 검색 결과에서 블로그 ID 찾기
    // 네이버 블로그 검색 결과는 .api_txt_lines 또는 .total_area 안에 있음
    const blogLinks: string[] = [];

    // 방법 1: 블로그 링크에서 blogId 추출
    $('a[href*="blog.naver.com"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      blogLinks.push(href);
    });

    // 방법 2: 검색 결과 리스트 내 블로그 URL
    const resultItems: { url: string; title: string; index: number }[] = [];
    let idx = 0;

    // .title_area 또는 .api_txt_lines 선택자 시도
    $('.sp_blog .title_area a, .api_txt_lines .title_link, .total_wrap .title_area a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();
      idx++;
      resultItems.push({ url: href, title, index: idx });
    });

    // blog.naver.com/{blogId} 패턴으로 찾기
    let rank: number | null = null;
    let blogUrl = '';

    for (const item of resultItems) {
      if (item.url.includes(`blog.naver.com/${blogId}`) ||
          item.url.includes(`blog.naver.com/PostView.naver?blogId=${blogId}`) ||
          item.url.includes(`blog.naver.com/PostView.nhn?blogId=${blogId}`)) {
        rank = item.index;
        blogUrl = item.url;
        break;
      }
    }

    // 2차 시도: 전체 HTML에서 blogId 패턴 매칭
    if (rank === null) {
      const allLinks = $('a').toArray();
      let position = 0;
      const seenUrls = new Set<string>();

      for (const link of allLinks) {
        const href = $(link).attr('href') || '';
        // 블로그 포스트 링크만 카운트
        if (href.includes('blog.naver.com/') && !seenUrls.has(href) && href.includes('/Post')) {
          seenUrls.add(href);
          position++;

          if (href.includes(blogId)) {
            rank = position;
            blogUrl = href;
            break;
          }
        }
      }
    }

    return {
      rank,
      totalResults: resultItems.length || idx,
      blogUrl,
      searchUrl,
    };
  } catch {
    return { rank: null, totalResults: 0, blogUrl: '', searchUrl };
  }
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
