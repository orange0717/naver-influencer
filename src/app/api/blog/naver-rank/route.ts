import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 메모리 캐시 (5분)
const cache = new Map<string, { data: unknown; expires: number }>();

/**
 * 네이버 블로그 검색에서 특정 블로거의 순위 확인
 * GET /api/blog/naver-rank?keyword=네이버검색광고&blogId=orangelibrary
 */
export async function GET(request: NextRequest) {
  const authUser = await getAuthUser(request);
  const cookieUser = await getCookieUser();
  if (!authUser && !cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const keyword = request.nextUrl.searchParams.get('keyword');
  const blogId = request.nextUrl.searchParams.get('blogId');

  if (!keyword || !blogId) {
    return NextResponse.json({ error: 'keyword and blogId are required' }, { status: 400 });
  }

  // 캐시 확인
  const cacheKey = `naver-rank-${keyword}-${blogId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    // 네이버 블로그 검색 Open API 사용
    const result = await searchNaverBlog(keyword, blogId);

    const response = {
      keyword,
      blogId,
      blogRank: result.rank,
      totalChecked: result.totalChecked,
      postTitle: result.postTitle,
      method: result.method,
    };

    // 5분 캐시
    cache.set(cacheKey, { data: response, expires: Date.now() + 5 * 60 * 1000 });

    return NextResponse.json(response);
  } catch (err) {
    console.error('Naver blog rank check failed:', err);
    return NextResponse.json({
      keyword,
      blogId,
      blogRank: null,
      totalChecked: 0,
      postTitle: null,
      method: 'error',
    });
  }
}

async function searchNaverBlog(keyword: string, blogId: string) {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { rank: null, totalChecked: 0, postTitle: null, method: 'no_key' };
  }

  // 네이버 블로그 검색 API - 최대 100개 결과
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Naver API error:', res.status, errorText);
    return { rank: null, totalChecked: 0, postTitle: null, method: 'api_error' };
  }

  const data = await res.json();
  const items = data.items || [];

  // blogId로 내 블로그 글 찾기
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const link = (item.link || '').toLowerCase();
    const bloggerLink = (item.bloggerlink || '').toLowerCase();
    const blogIdLower = blogId.toLowerCase();

    // 다양한 URL 패턴으로 매칭
    if (
      link.includes(`blog.naver.com/${blogIdLower}/`) ||
      link.includes(`blog.naver.com/${blogIdLower}?`) ||
      link.includes(`blogid=${blogIdLower}`) ||
      bloggerLink.includes(`/${blogIdLower}`) ||
      bloggerLink.endsWith(`/${blogIdLower}`)
    ) {
      // HTML 태그 제거
      const title = (item.title || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');

      return {
        rank: i + 1,
        totalChecked: items.length,
        postTitle: title,
        method: 'api',
      };
    }
  }

  return {
    rank: null,
    totalChecked: items.length,
    postTitle: null,
    method: 'api',
  };
}
