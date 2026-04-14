import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/community — 게시글 목록 (삭제 포함)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const search = (url.searchParams.get('search') || '').trim();
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  let query = supabase
    .from('community_posts')
    .select('id, category, title, author_name, view_count, like_count, comment_count, is_pinned, is_deleted, created_at', { count: 'exact' });

  if (search) {
    query = query.or(`title.ilike.%${search}%,author_name.ilike.%${search}%`);
  }

  const { data: posts, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[admin/community] error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({
    posts: posts || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

/**
 * PATCH /api/admin/community — 게시글 삭제/복원
 * body: { postId, action: 'delete' | 'restore' }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const { postId, action } = body;

  if (!postId || !['delete', 'restore'].includes(action)) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('community_posts')
    .update({ is_deleted: action === 'delete' })
    .eq('id', postId);

  if (error) {
    console.error('[admin/community] patch error:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
