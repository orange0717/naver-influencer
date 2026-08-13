/**
 * POST /api/credits/purchase/prepare
 * 현금(PortOne) 크레딧 구매 사전등록 — 클라가 PortOne.requestPayment 직전 호출.
 * Body: { packageKey: string } → { paymentId, name, amount, credits }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { prepareCreditPurchase } from '@/lib/credit-purchase';
import { paymentLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (await paymentLimiter.check(`credit-prepare:${getClientIp(req)}`)) {
      return rateLimitResponse();
    }

    const { packageKey } = (await req.json()) as { packageKey?: string };
    if (!packageKey) {
      return NextResponse.json({ error: '상품이 지정되지 않았습니다.' }, { status: 400 });
    }

    const supa = await createRouteHandlerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const result = await prepareCreditPurchase(user.id, packageKey);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[/api/credits/purchase/prepare] error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
