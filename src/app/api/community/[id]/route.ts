import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community/[id] — 게시글 상세 + 댓글
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = createServiceClient();

    // 게시글 조회
    const { data: post, error } = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 조회수 atomic 증가
    const { data: newViewCount } = await supabase.rpc('increment_view_count', { post_id: id });

    // 댓글 조회
    const { data: comments } = await supabase
      .from('community_comments')
      .select('id, content, author_id, author_name, author_type, created_at')
      .eq('post_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      post: { ...post, view_count: newViewCount ?? post.view_count + 1 },
      comments: comments || [],
    });
  } catch (err) {
    console.error('[community] GET detail error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/community/[id] — 게시글 삭제 (작성자만)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // 쿠키에서 인증된 유저 확인
    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // 작성자 확인 (쿠키의 유저 ID와 게시글 작성자 비교)
    const { data: post } = await supabase
      .from('community_posts')
      .select('author_id')
      .eq('id', id)
      .single();

    if (!post || post.author_id !== cookieUser.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 소프트 삭제
    await supabase
      .from('community_posts')
      .update({ is_deleted: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[community] DELETE error:', err);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
