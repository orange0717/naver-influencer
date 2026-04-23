import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { isValidFingerprint } from '@/lib/voter-fingerprint';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notices/[id]/poll/vote — 공지사항 투표 제출
 *
 * Body: { option_ids: string[], voter_fingerprint?: string }
 * - 로그인 사용자: user_id로 중복 방지
 * - 비회원: voter_fingerprint(localStorage UUID) + IP로 중복 방지
 * - is_multiple=false 인 경우 option_ids 배열에서 첫번째 1개만 반영
 * - is_multiple=true 인 경우 모든 option_id에 대해 개별 row 삽입 (중복 제외)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(`poll:${ip}`)) return rateLimitResponse();

    const { id: noticeId } = await params;

    const body = await req.json().catch(() => ({}));
    const rawOptionIds = Array.isArray(body?.option_ids) ? body.option_ids : [];
    const optionIds = rawOptionIds.filter((x: unknown) => typeof x === 'string' && x.length > 0).slice(0, 5);

    if (optionIds.length === 0) {
      return NextResponse.json({ error: '선택지를 선택해주세요.' }, { status: 400 });
    }

    const authUser = await getAuthUser(req).catch(() => null);
    const voterFingerprint = typeof body?.voter_fingerprint === 'string' ? body.voter_fingerprint : '';

    if (!authUser && !isValidFingerprint(voterFingerprint)) {
      return NextResponse.json({ error: '유효한 투표자 식별자가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 투표 제출은 RPC(SECURITY DEFINER + FOR UPDATE 잠금)로 원자화해서
    // DELETE → INSERT 사이 race condition 으로 중복 투표가 생기는 것을 방지
    const { data: voted, error: rpcErr } = await supabase.rpc('submit_notice_poll_vote', {
      p_notice_id: noticeId,
      p_option_ids: optionIds,
      p_user_id: authUser?.userId || null,
      p_voter_fingerprint: voterFingerprint,
      p_voter_ip: ip.slice(0, 64),
    });

    if (rpcErr) {
      const msg = rpcErr.message || '';
      if (msg.includes('poll not found')) {
        return NextResponse.json({ error: '투표를 찾을 수 없습니다.' }, { status: 404 });
      }
      if (msg.includes('no valid options')) {
        return NextResponse.json({ error: '유효하지 않은 선택지입니다.' }, { status: 400 });
      }
      console.error('[notice-poll-vote] rpc error:', rpcErr);
      return NextResponse.json({ error: '투표 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, voted: voted || [] });
  } catch (err) {
    console.error('[notice-poll-vote] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
