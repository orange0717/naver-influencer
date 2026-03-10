import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/[id]/comments — 댓글 작성
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: post_id } = await params;

  try {
    const body = await req.json();
    const { content, author_id, author_type, author_name } = body;

    if (!content?.trim() || !author_id || !author_type) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 게시글 존재 확인
    const { data: post } = await supabase
      .from('community_posts')
      .select('id, comment_count')
      .eq('id', post_id)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 댓글 작성
    const { data: comment, error } = await supabase
      .from('community_comments')
      .insert({
        post_id,
        content: content.trim().slice(0, 1000),
        author_id,
        author_type,
        author_name: (author_name || author_id).slice(0, 50),
      })
      .select('id, content, author_id, author_name, author_type, created_at')
      .single();

    if (error) throw error;

    // 게시글의 comment_count 증가
    await supabase
      .from('community_posts')
      .update({ comment_count: (post.comment_count || 0) + 1 })
      .eq('id', post_id);

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('[community] COMMENT error:', err);
    return NextResponse.json({ error: '댓글 작성에 실패했습니다.' }, { status: 500 });
  }
}
