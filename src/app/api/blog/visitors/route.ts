import { NextRequest, NextResponse } from 'next/server';
import { getBlogVisitorSummary } from '@/lib/blog-crawler';
import { assertBlogResourceAccess } from '@/lib/blog-access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/visitors?blogId=xxx&days=30 — 블로그 방문자 이력 조회
 * DB에 데이터가 없으면 네이버에서 직접 크롤링하여 저장
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get('blogId');
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30') || 30));

  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(req, String(blogId));
  if (denied) return denied;

  try {
    const summary = await getBlogVisitorSummary(blogId, days);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[blog/visitors] error:', err);
    return NextResponse.json({ error: '방문자 데이터 조회 실패' }, { status: 500 });
  }
}
