import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { voteSchema } from '@/lib/validations/community';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/[id]/vote — 투표
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params;

  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(`vote:${ip}`)) return rateLimitResponse();

    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(voteSchema, body);
    if (!v.success) return v.response;

    const { option_id } = v.data;
    const supabase = createServiceClient();

    // 게시글 존재 확인
    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', postId)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 투표 존재 확인
    const { data: poll } = await supabase
      .from('community_polls')
      .select('id, ends_at')
      .eq('post_id', postId)
      .single();

    if (!poll) {
      return NextResponse.json({ error: '투표가 없는 게시글입니다.' }, { status: 404 });
    }

    // 마감 체크
    if (poll.ends_at && new Date(poll.ends_at) < new Date()) {
      return NextResponse.json({ error: '마감된 투표입니다.' }, { status: 400 });
    }

    // 선택지 유효성 확인
    const { data: option } = await supabase
      .from('community_poll_options')
      .select('id')
      .eq('id', option_id)
      .eq('poll_id', poll.id)
      .single();

    if (!option) {
      return NextResponse.json({ error: '올바르지 않은 선택지입니다.' }, { status: 400 });
    }

    // 중복 투표 체크
    const { data: existing } = await supabase
      .from('community_poll_votes')
      .select('id')
      .eq('poll_id', poll.id)
      .eq('user_id', cookieUser.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: '이미 투표하셨습니다.' }, { status: 409 });
    }

    // 투표 기록 + 카운트 증가
    const { error: voteError } = await supabase
      .from('community_poll_votes')
      .insert({
        poll_id: poll.id,
        option_id,
        user_id: cookieUser.id,
      });

    if (voteError) {
      if (voteError.code === '23505') {
        return NextResponse.json({ error: '이미 투표하셨습니다.' }, { status: 409 });
      }
      throw voteError;
    }

    // 카운터 증가 실패 시 투표 레코드는 이미 insert 되어 있으므로 성공 응답을 반환하지 말고 500 으로 명확히 실패를 알림.
    const { error: rpcError } = await supabase.rpc('increment_poll_vote_count', { p_option_id: option_id });
    if (rpcError) {
      console.error('[community/vote] increment_poll_vote_count RPC 실패:', rpcError.message);
      return NextResponse.json({ error: '투표 집계 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 업데이트된 결과 반환
    const { data: options } = await supabase
      .from('community_poll_options')
      .select('id, label, vote_count, sort_order')
      .eq('poll_id', poll.id)
      .order('sort_order', { ascending: true });

    const totalVotes = (options || []).reduce((sum, o) => sum + (o.vote_count || 0), 0);

    return NextResponse.json({
      success: true,
      options: options || [],
      totalVotes,
      userVoteOptionId: option_id,
    });
  } catch (err) {
    console.error('[community/vote] POST error:', err);
    return NextResponse.json({ error: '투표에 실패했습니다.' }, { status: 500 });
  }
}
