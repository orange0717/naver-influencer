import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/stories/[id]/comments/[commentId] — 댓글 삭제 (작성자 또는 관리자)
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await context.params;

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: comment } = await supabase
      .from('story_comments')
      .select('author_id, is_deleted')
      .eq('id', commentId)
      .eq('story_id', id)
      .single();

    if (!comment || comment.is_deleted) {
      return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const isOwner = comment.author_id === authUser.userId;
    const isAdminUser = isAdmin(authUser.userId);
    if (!isOwner && !isAdminUser) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    await supabase.from('story_comments').update({ is_deleted: true }).eq('id', commentId);
    await supabase.rpc('decrement_story_comment_count', { p_story_id: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stories/comments] DELETE error:', err);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
