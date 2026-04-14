import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reports — 신고 목록
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  let query = supabase
    .from('community_reports')
    .select('id, reporter_id, reporter_type, post_id, comment_id, reason, description, status, created_at', { count: 'exact' });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: reports, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[admin/reports] error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  // 신고된 게시글 제목 매핑
  const postIds = (reports || []).map(r => r.post_id).filter(Boolean);
  const postMap = new Map<string, string>();
  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from('community_posts')
      .select('id, title')
      .in('id', postIds);
    for (const p of (posts || [])) {
      postMap.set(p.id, p.title);
    }
  }

  const result = (reports || []).map(r => ({
    ...r,
    post_title: r.post_id ? postMap.get(r.post_id) || null : null,
  }));

  return NextResponse.json({
    reports: result,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

/**
 * PATCH /api/admin/reports — 신고 상태 변경
 * body: { reportId, status: 'reviewed' | 'dismissed' }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const { reportId, status } = body;

  if (!reportId || !['reviewed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('community_reports')
    .update({ status })
    .eq('id', reportId);

  if (error) {
    console.error('[admin/reports] patch error:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
