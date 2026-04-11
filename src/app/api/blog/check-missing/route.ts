import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

// 메모리 캐시 (5분)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE = 200;

function cleanCache() {
  if (cache.size > MAX_CACHE) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expires < now) cache.delete(k);
    }
    if (cache.size > MAX_CACHE) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires);
      for (let i = 0; i < oldest.length - MAX_CACHE; i++) cache.delete(oldest[i][0]);
    }
  }
}

/**
 * 네이버 블로그탭에서 포스팅 노출 여부 확인
 * 포스팅 제목으로 검색하여 해당 blogId/postId가 존재하는지 체크
 */
async function checkBlogTab(query: string, blogId: string, postId: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  const blogIdLower = blogId.toLowerCase();
  const baseUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

  let globalRank = 0;
  const seenPosts = new Set<string>();

  for (let page = 1; page <= 3; page++) {
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
      const $ = cheerio.load(html);
      const blogLinks: { blogId: string; postId: string }[] = [];

      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
        if (!match) return;
        const key = `${match[1]}/${match[2]}`;
        if (seenPosts.has(key)) return;
        seenPosts.add(key);
        blogLinks.push({ blogId: match[1], postId: match[2] });
      });

      // regex 폴백
      if (blogLinks.length === 0) {
        const regex = /blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
          const key = `${m[1]}/${m[2]}`;
          if (seenPosts.has(key)) continue;
          seenPosts.add(key);
          blogLinks.push({ blogId: m[1], postId: m[2] });
        }
      }

      for (const link of blogLinks) {
        globalRank++;
        // postId가 있으면 정확 매칭, 없으면 blogId만 매칭
        if (link.blogId.toLowerCase() === blogIdLower) {
          if (!postId || link.postId === postId) {
            return { exposed: true, rank: globalRank };
          }
        }
      }
    } catch { continue; }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  return { exposed: false, rank: null };
}

/**
 * 네이버 통합검색(VIEW) 탭에서 포스팅 노출 여부 확인
 * 네이버 검색 API(webkr.json) 사용
 */
async function checkViewTab(query: string, blogId: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  if (!NAVER_SEARCH_CLIENT_ID || !NAVER_SEARCH_CLIENT_SECRET) {
    return { exposed: false, rank: null };
  }

  try {
    const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=100&sort=sim`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
      },
    });
    if (!res.ok) return { exposed: false, rank: null };

    const data = await res.json();
    const items = data.items || [];
    const blogIdLower = blogId.toLowerCase();

    let blogRank = 0;
    for (const item of items) {
      const link = item.link || '';
      const blogMatch = link.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
      if (!blogMatch) continue;

      blogRank++;
      if (blogMatch[1].toLowerCase() === blogIdLower) {
        return { exposed: true, rank: blogRank };
      }
    }
  } catch { /* ignore */ }

  return { exposed: false, rank: null };
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
    const { blogId, postTitle, postId } = body;

    if (!blogId || !postTitle) {
      return NextResponse.json({ error: 'blogId, postTitle 필수' }, { status: 400 });
    }

    // 캐시 확인
    const cacheKey = `missing-${blogId}-${postId || postTitle.slice(0, 30)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    // 검색어: 제목이 너무 길면 앞 40자만 사용
    const query = postTitle.length > 40 ? postTitle.slice(0, 40) : postTitle;

    // 블로그탭 + 통합검색 동시 확인
    const [blogTab, viewTab] = await Promise.all([
      checkBlogTab(query, blogId, postId || ''),
      checkViewTab(query, blogId),
    ]);

    const result = {
      blogTab: { exposed: blogTab.exposed, rank: blogTab.rank },
      viewTab: { exposed: viewTab.exposed, rank: viewTab.rank },
    };

    // 캐시 저장
    cleanCache();
    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '누락 확인 중 오류' }, { status: 500 });
  }
}
