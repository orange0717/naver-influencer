import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { trialStartLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

const TRIAL_DAYS = 7;
const TRIAL_PLAN = 'INFLUENCER';

/**
 * POST /api/trial/start
 *
 * 자가발급 7일 무료체험 — subscription_plan 이 한 번도 부여된 적 없는 회원만
 * 대상. 이미 체험/결제를 받아본 적 있는 회원(만료 포함)은 거부한다 —
 * "체험 종료" 회원은 이 API가 아니라 결제로만 재개해야 한다(TrialEndedModal).
 * 원자적 클레임: subscription_plan IS NULL 조건이 매치되는 요청만 성공해
 * 동시 클릭(더블탭 등)으로 만료일이 계속 늘어나는 것을 막는다.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await trialStartLimiter.check(ip)) return rateLimitResponse();

  const authUser = await getAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (await isRestrictedByUserId(authUser.userId)) {
    return NextResponse.json({ error: '해당 계정은 이 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 원자적 클레임: subscription_plan 이 아직 한 번도 부여되지 않은 경우에만 성공
  const { data: claimed, error } = await supabase
    .from('users')
    .update({ subscription_plan: TRIAL_PLAN, subscription_expires_at: expiresAt })
    .eq('id', authUser.userId)
    .is('subscription_plan', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[trial/start] update error:', error);
    return NextResponse.json({ error: '체험 시작 중 오류가 발생했습니다.' }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json(
      { error: '이미 체험을 이용했거나 이용권이 있는 계정입니다.' },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, plan: TRIAL_PLAN, expiresAt });
}
