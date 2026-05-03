/**
 * POST /api/portone/billing/complete
 * 빌링키 발급 완료 콜백 — 클라이언트가 PortOne.requestIssueBillingKey 결과를 받은 직후 호출.
 * Body: { billingKey: string, planKey: string }
 *
 * 동작: 빌링키 검증 → 구독 생성 → 즉시 첫 결제 → 라이센스 활성화.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { completeBillingKeyIssue } from '@/lib/billing';
import { getPlan } from '@/lib/payment-config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { billingKey, planKey } = (await req.json()) as { billingKey?: string; planKey?: string };
    if (!billingKey || !planKey) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }
    if (!getPlan(planKey)) {
      return NextResponse.json({ error: '유효하지 않은 플랜입니다.' }, { status: 400 });
    }

    const supa = await createRouteHandlerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const result = await completeBillingKeyIssue({
      userId: user.id,
      billingKey,
      planKey,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (!result.firstChargeOk) {
      return NextResponse.json(
        { ok: true, subscriptionId: result.subscriptionId, firstChargeFailed: true, error: result.error },
        { status: 402 } // 402 Payment Required: 빌링키는 발급됐지만 첫 결제 실패
      );
    }
    return NextResponse.json({ ok: true, subscriptionId: result.subscriptionId });
  } catch (e) {
    console.error('[/api/portone/billing/complete] error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
