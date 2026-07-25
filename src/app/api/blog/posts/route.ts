import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { fetchBlogPostsPage } from '@/lib/blog-posts-fetcher';

export const dynamic = 'force-dynamic';

// 캐시 (5분, 최대 200개)
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, { data: unknown; expires: number }>();

function setPostCache(key: string, data: unknown) {
  const now = Date.now();
  // 만료된 엔트리 정리
  for (const [k, v] of cache) {
    if (v.expires < now) cache.delete(k);
  }
  // 크기 제한
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expires: now + 5 * 60 * 1000 });
}

/**
 * 네이버 블로그 포스트 목록을 가져옵니다.
 * 1) PostTitleListAsync API 시도 (한국 서버)
 * 2) PostList.naver HTML 크롤링 (해외 서버 대응)
 * 3) RSS 피드 폴백 (최후 수단)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const blogId = searchParams.get('blogId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const count = Math.min(parseInt(searchParams.get('count') || '10', 10), 30);

    if (!blogId) {
      return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, blogId);
    if (denied) return denied;

    // 캐시 확인
    const cacheKey = `posts-${blogId}-${page}-${count}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const result = { ...(await fetchBlogPostsPage(blogId, page, count)), page, countPerPage: count };
    setPostCache(cacheKey, result);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '포스트 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
