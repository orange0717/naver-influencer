import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { createCommentSchema } from '@/lib/validations/community';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createCommunityReactionNotification } from '@/lib/notifications';

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
    const ip = getClientIp(req);
    if (await communityLimiter.check(ip)) return rateLimitResponse();

    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(createCommentSchema, body);
    if (!v.success) return v.response;

    const { content, author_name } = v.data;

    const supabase = createServiceClient();

    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', post_id)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: comment, error } = await supabase
      .from('community_comments')
      .insert({
        post_id,
        content,
        author_id: cookieUser.id,
        author_type: cookieUser.type,
        author_name: (author_name || cookieUser.id).slice(0, 50),
      })
      .select('id, content, author_id, author_name, author_type, created_at')
      .single();

    if (error) throw error;

    await supabase.rpc('increment_comment_count', { post_id });

    // 글 작성자에게 댓글 알림 (자기 글에 자기가 댓글 달면 제외)
    const { data: postData } = await supabase
      .from('community_posts')
      .select('title, author_id, author_type')
      .eq('id', post_id)
      .single();

    if (postData && postData.author_id !== cookieUser.id) {
      createCommunityReactionNotification(supabase, {
        postId: post_id,
        postTitle: postData.title,
        authorId: postData.author_id,
        authorType: postData.author_type,
        reactorName: (author_name || cookieUser.id).slice(0, 20),
        reactionType: 'comment',
        commentPreview: content.slice(0, 100),
      }).catch(err => console.error('[community] 댓글 알림 실패:', err));
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('[community] COMMENT error:', err);
    return NextResponse.json({ error: '댓글 작성에 실패했습니다.' }, { status: 500 });
  }
}
