import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

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
    // 쿠키에서 인증된 유저 확인
    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { content, author_name } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 게시글 존재 확인
    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
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
        author_id: cookieUser.id,
        author_type: cookieUser.type,
        author_name: (author_name || cookieUser.id).slice(0, 50),
      })
      .select('id, content, author_id, author_name, author_type, created_at')
      .single();

    if (error) throw error;

    // comment_count atomic 증가
    await supabase.rpc('increment_comment_count', { post_id });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('[community] COMMENT error:', err);
    return NextResponse.json({ error: '댓글 작성에 실패했습니다.' }, { status: 500 });
  }
}
