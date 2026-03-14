import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 메모리 캐시 (3분)
const cache = new Map<string, { data: unknown; expires: number }>();

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

      // === 방법 1: 모든 블로그 포스트 링크를 직접 추출 (2025+ 새 구조 대응) ===
      const seenHrefs = new Set<string>();

      // blog.naver.com/username/postid 패턴의 모든 링크 수집
      $('a').each((_, el) => {
        if (foundRank !== null) return;

        const href = $(el).attr('href') || '';
        const match = href.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);

        if (!match || seenHrefs.has(href)) return;
        seenHrefs.add(href);

        const linkBlogId = match[1].toLowerCase();

        // 텍스트에서 제목 추출 (blog.naver.com 포함된 텍스트 제외)
        let title = $(el).text().trim();
        if (title.includes('blog.naver.com') || title.length < 3) {
          // 같은 포스트 URL을 가진 다른 링크에서 제목 찾기
          const titleLink = $(`a[href="${href}"]`).filter((_, a) => {
            const t = $(a).text().trim();
            return t.length > 3 && !t.includes('blog.naver.com');
          }).first();
          if (titleLink.length) {
            title = titleLink.text().trim();
          }
        }

        // 프로필 링크가 아닌 실제 포스트만 카운트
        globalRank++;
        totalFound++;

        if (linkBlogId === blogIdLower) {
          foundRank = globalRank;
          foundUrl = href;
          // HTML 태그 제거
          foundTitle = title
            .replace(/<[^>]*>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .slice(0, 200);
        }
      });

      // === 방법 2: 블로거 프로필 링크도 체크 (blog.naver.com/username 형식) ===
      if (foundRank === null) {
        $(`a[href*="blog.naver.com/${blogIdLower}"]`).each((_, el) => {
          if (foundRank !== null) return;
          const href = $(el).attr('href') || '';
          // 이미 포스트 링크로 찾았으면 스킵
          if (href.match(/blog\.naver\.com\/[^/?#]+\/\d+/)) return;
          // 프로필 링크인 경우 - 근처에서 포스트 링크 찾기
          const parent = $(el).closest('div');
          const postLink = parent.find('a').filter((_, a) => {
            const h = $(a).attr('href') || '';
            return h.match(/blog\.naver\.com\/[^/?#]+\/\d+/) !== null;
          }).first();
          if (postLink.length) {
            const postHref = postLink.attr('href') || '';
            const postTitle = postLink.text().trim();
            // 이 포스트의 순위를 찾기
            let rank = 0;
            seenHrefs.forEach(() => rank++);
            if (rank > 0) {
              foundRank = rank;
              foundUrl = postHref;
              foundTitle = postTitle.slice(0, 200);
            }
          }
        });
      }

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

    // 캐시 확인 (3분)
    const cacheKey = `rank-${keyword}-${blogId}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const result = await searchBlogRank(keyword, blogId);

    // 캐시 저장
    cache.set(cacheKey, { data: result, expires: Date.now() + 3 * 60 * 1000 });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: '순위 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
