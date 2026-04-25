import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { createStoryCommentSchema } from '@/lib/validations/stories';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stories/[id]/comments — 댓글 목록
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const supabase = createServiceClient();
    const { data: comments, error } = await supabase
      .from('story_comments')
      .select('id, author_id, author_name, content, created_at')
      .eq('story_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ comments: comments || [] });
  } catch (err) {
    console.error('[stories/comments] GET error:', err);
    return NextResponse.json({ comments: [] });
  }
}

/**
 * POST /api/stories/[id]/comments — 댓글 작성
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(ip)) return rateLimitResponse();

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(createStoryCommentSchema, body);
    if (!v.success) return v.response;

    const supabase = createServiceClient();

    // 글 확인 (승인된 글에만 댓글 허용)
    const { data: story } = await supabase
      .from('growth_stories')
      .select('id, status, is_deleted')
      .eq('id', id)
      .single();

    if (!story || story.is_deleted || story.status !== 'approved') {
      return NextResponse.json({ error: '후기를 찾을 수 없습니다.' }, { status: 404 });
    }

    const displayName = (v.data.author_name || authUser.user.nickname || '회원').slice(0, 50);

    const { data: comment, error } = await supabase
      .from('story_comments')
      .insert({
        story_id: id,
        author_id: authUser.userId,
        author_name: displayName,
        content: v.data.content,
      })
      .select('id, author_id, author_name, content, created_at')
      .single();

    if (error) throw error;

    await supabase.rpc('increment_story_comment_count', { p_story_id: id });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('[stories/comments] POST error:', err);
    return NextResponse.json({ error: '댓글 작성에 실패했습니다.' }, { status: 500 });
  }
}
