import { NextRequest, NextResponse } from 'next/server';
import { extractBlogKeywords } from '@/lib/blog-crawler';
import { assertBlogResourceAccess } from '@/lib/blog-access';

// 간단한 메모리 캐시 (1일)
const cache = new Map<string, { data: unknown; expires: number }>();

export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId');

  if (!blogId) {
    return NextResponse.json({ error: 'blogId is required' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, String(blogId));
  if (denied) return denied;

  // 캐시 확인
  const cacheKey = `blog-keywords-${blogId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const keywords = await extractBlogKeywords(blogId);

    const response = {
      blogId,
      keywords,
      extractedAt: new Date().toISOString(),
      totalPosts: keywords.length > 0 ? Math.max(...keywords.map(k => k.postCount)) : 0,
    };

    // 1일 캐시
    cache.set(cacheKey, {
      data: response,
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Blog keyword extraction failed:', error);
    return NextResponse.json(
      { error: 'Failed to extract keywords', keywords: [] },
      { status: 500 }
    );
  }
}
