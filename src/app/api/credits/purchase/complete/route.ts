/**
 * POST /api/credits/purchase/complete
 * 현금(PortOne) 크레딧 구매 완료 콜백 — 클라가 결제 결과를 받은 직후 호출.
 * Body: { paymentId: string } → 서버가 PortOne 검증 후 크레딧 지급(멱등, 구독 생성 없음).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { completeCreditPurchase } from '@/lib/credit-purchase';
import { paymentLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (await paymentLimiter.check(`credit-complete:${getClientIp(req)}`)) {
      return rateLimitResponse();
    }

    const { paymentId } = (await req.json()) as { paymentId?: string };
    if (!paymentId) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    const supa = await createRouteHandlerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const result = await completeCreditPurchase({ userId: user.id, paymentId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, credits: result.credits, creditBalance: result.creditBalance });
  } catch (e) {
    console.error('[/api/credits/purchase/complete] error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
