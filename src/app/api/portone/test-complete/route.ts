import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { PAYMENT_PLANS } from '@/lib/payment-config';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portone/test-complete
 * 테스트 모드 결제 완료 — PortOne 키 미설정 시 구독 반영
 *
 * Body: { planKey: string }
 */
export async function POST(req: NextRequest) {
  // PortOne 키가 설정되어 있으면 테스트 모드 차단
  if (process.env.PORTONE_API_SECRET) {
    return NextResponse.json({ error: '실제 결제 모드에서는 사용할 수 없습니다.' }, { status: 403 });
  }

  const authResult = await getAuthUser(req);
  if (!authResult?.userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json();
  const planKey = (body.planKey || '').trim();
  const plan = PAYMENT_PLANS[planKey];

  if (!plan) {
    return NextResponse.json({ error: '유효하지 않은 플랜입니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  // users 테이블 구독 상태 업데이트 (컬럼이 없으면 무시)
  const { error } = await supabase
    .from('users')
    .update({
      subscription_plan: plan.planName,
      subscription_expires_at: expiresAt.toISOString(),
    })
    .eq('id', authResult.userId);

  if (error) {
    // 컬럼 미존재(PGRST204) 등은 무시 — 테스트 모드에서는 UI만 확인
    console.warn('[test-complete] update skipped:', error.code, error.message);
  }

  return NextResponse.json({
    verified: true,
    planName: plan.planName,
    durationDays: plan.durationDays,
    expiresAt: expiresAt.toISOString(),
  });
}
