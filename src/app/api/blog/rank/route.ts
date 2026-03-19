import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { validateSearchParams } from '@/lib/validations';
import { blogRankQuerySchema } from '@/lib/validations/blog';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 메모리 캐시 (3분)
const cache = new Map<string, { data: unknown; expires: number }>();

/**
 * 네이버 블로그탭에서 특정 블로그의 순위를 검색합니다.
 * 1~3페이지(약 30개)까지 확인합니다.
 *
 * 2025+ 네이버 검색 구조 대응:
 * - ssc=tab.blog.all 형식의 URL 사용 (서버사이드 렌더링 보장)
 * - Accept-Encoding 헤더 필수 (완전한 HTML 수신)
 * - Cheerio + regex 하이브리드 방식으로 블로그 링크 추출
 */
async function searchBlogRank(keyword: string, blogId: string): Promise<{
  rank: number | null;
  totalResults: number;
  blogUrl: string;
  searchUrl: string;
  postTitle: string;
}> {
  const blogIdLower = blogId.toLowerCase();
  // 2025+ URL 형식: ssc=tab.blog.all 이 서버사이드 렌더링을 보장
  const baseUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
  const displayUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_blog`;

  let globalRank = 0;
  let foundRank: number | null = null;
  let foundUrl = '';
  let foundTitle = '';
  const seenPosts = new Set<string>();

  // 1~3페이지 검색
  for (let page = 1; page <= 3; page++) {
    if (foundRank !== null) break;

    const start = (page - 1) * 10 + 1;
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}&start=${start}`;

    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Referer': 'https://search.naver.com/',
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      // === 방법 1: Cheerio로 <a> 태그 스캔 ===
      const $ = cheerio.load(html);
      const blogLinks: { blogId: string; postId: string; title: string; href: string }[] = [];

      // 모든 <a> 태그에서 blog.naver.com/username/postid 패턴 찾기
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
        if (!match) return;

        const linkBlogId = match[1];
        const postId = match[2];
        const key = `${linkBlogId}/${postId}`;
        if (seenPosts.has(key)) return;

        // 제목 추출: <a> 태그의 텍스트 중 유의미한 것 찾기
        let title = $(el).text().trim();
        // blog.naver.com 같은 URL 텍스트나 너무 짧은 텍스트 제외
        if (title.includes('blog.naver.com') || title.length < 3 || /^\d+$/.test(title)) {
          // 같은 href를 가진 다른 <a>에서 제목 찾기
          const otherLink = $(`a[href="${href}"]`).filter((_, a) => {
            const t = $(a).text().trim();
            return t.length >= 3 && !t.includes('blog.naver.com') && !/^\d+$/.test(t);
          }).first();
          if (otherLink.length) {
            title = otherLink.text().trim();
          } else {
            title = '';
          }
        }

        seenPosts.add(key);
        blogLinks.push({ blogId: linkBlogId, postId, title, href });
      });

      // === 방법 2: Cheerio에서 못 찾으면 regex 폴백 ===
      if (blogLinks.length === 0) {
        const regex = /blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/g;
        let regexMatch;
        while ((regexMatch = regex.exec(html)) !== null) {
          const linkBlogId = regexMatch[1];
          const postId = regexMatch[2];
          const key = `${linkBlogId}/${postId}`;
          if (seenPosts.has(key)) continue;
          seenPosts.add(key);
          blogLinks.push({
            blogId: linkBlogId,
            postId,
            title: '',
            href: `https://blog.naver.com/${linkBlogId}/${postId}`,
          });
        }
      }

      // 순위 매기기
      for (const link of blogLinks) {
        globalRank++;

        if (link.blogId.toLowerCase() === blogIdLower) {
          foundRank = globalRank;
          foundUrl = link.href.startsWith('http') ? link.href : `https://blog.naver.com/${link.blogId}/${link.postId}`;
          foundTitle = link.title
            .replace(/<[^>]*>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .slice(0, 200);
          break;
        }
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
    totalResults: seenPosts.size,
    blogUrl: foundUrl,
    searchUrl: displayUrl,
    postTitle: foundTitle,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (blogAnalyzeLimiter.check(ip)) return rateLimitResponse();

    const v = validateSearchParams(blogRankQuerySchema, new URL(request.url).searchParams);
    if (!v.success) return v.response;

    const { keyword, blogId } = v.data;

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
