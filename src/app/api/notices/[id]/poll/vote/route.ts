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

    // 해당 공지의 투표 정보 조회
    const { data: poll, error: pollErr } = await supabase
      .from('notice_polls')
      .select('id, is_multiple')
      .eq('notice_id', noticeId)
      .maybeSingle();

    if (pollErr || !poll) {
      return NextResponse.json({ error: '투표를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 옵션이 실제로 이 poll에 속하는지 검증
    const { data: validOptions } = await supabase
      .from('notice_poll_options')
      .select('id')
      .eq('poll_id', poll.id)
      .in('id', optionIds);

    const validIds = (validOptions || []).map(o => o.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 선택지입니다.' }, { status: 400 });
    }

    // 단일 선택 모드에서는 첫 1개만 허용
    const finalOptionIds = poll.is_multiple ? validIds : [validIds[0]];

    // 기존 투표 조회 (재투표 시 기존 것 삭제 후 새로 저장)
    if (authUser) {
      await supabase
        .from('notice_poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .eq('user_id', authUser.userId);
    } else {
      await supabase
        .from('notice_poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .is('user_id', null)
        .eq('voter_fingerprint', voterFingerprint);
    }

    // 새 투표 삽입
    const rows = finalOptionIds.map(optionId => ({
      poll_id: poll.id,
      option_id: optionId,
      user_id: authUser?.userId || null,
      voter_fingerprint: authUser ? `user:${authUser.userId}` : voterFingerprint,
      voter_ip: ip.slice(0, 64),
    }));

    const { error: insertErr } = await supabase
      .from('notice_poll_votes')
      .insert(rows);

    if (insertErr) {
      console.error('[notice-poll-vote] insert error:', insertErr);
      return NextResponse.json({ error: '투표 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, voted: finalOptionIds });
  } catch (err) {
    console.error('[notice-poll-vote] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
