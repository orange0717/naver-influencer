import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { createNoticeCommentSchema } from '@/lib/validations/notice';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notices/[id]/comments — 댓글 작성 (로그인 필요)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: notice_id } = await params;

  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(ip)) return rateLimitResponse();

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(createNoticeCommentSchema, body);
    if (!v.success) return v.response;

    const { content } = v.data;

    const supabase = createServiceClient();

    // 공지 존재 확인
    const { data: notice } = await supabase
      .from('notices')
      .select('id')
      .eq('id', notice_id)
      .eq('is_deleted', false)
      .single();

    if (!notice) {
      return NextResponse.json({ error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: comment, error } = await supabase
      .from('notice_comments')
      .insert({
        notice_id,
        content,
        author_id: authUser.userId,
        author_name: authUser.user.nickname || '사용자',
        author_type: 'influencer',
      })
      .select('id, content, author_id, author_name, author_type, created_at')
      .single();

    if (error) throw error;

    await supabase.rpc('increment_notice_comment_count', { p_notice_id: notice_id });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('[notices] COMMENT error:', err);
    return NextResponse.json({ error: '댓글 작성에 실패했습니다.' }, { status: 500 });
  }
}
