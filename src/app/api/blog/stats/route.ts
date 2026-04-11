import { NextRequest, NextResponse } from 'next/server';
import { fetchBlogProfileStats } from '@/lib/blog-crawler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/stats?blogId=xxx — 블로그 프로필 통계 (전체방문자, 이웃수, 공식블로그 등)
 */
export async function GET(req: NextRequest) {
  const blogId = new URL(req.url).searchParams.get('blogId');
  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  try {
    const stats = await fetchBlogProfileStats(blogId);
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[blog/stats] error:', err);
    return NextResponse.json({ error: '블로그 통계 조회 실패' }, { status: 500 });
  }
}
