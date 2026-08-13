/**
 * POST /api/credits/purchase/ncash
 * N캐시로 크레딧 즉시 구매 (PG 불필요). Body: { packageKey: string, idempotencyKey?: string }
 * 서버에서 N캐시 잔액 검증·차감 후 크레딧 지급(멱등). 프론트 우회 불가.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { purchaseCreditsWithNcash } from '@/lib/credit-purchase';
import { paymentLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (await paymentLimiter.check(`credit-ncash:${getClientIp(req)}`)) {
      return rateLimitResponse();
    }

    const { packageKey, idempotencyKey } = (await req.json()) as {
      packageKey?: string;
      idempotencyKey?: string;
    };
    if (!packageKey) {
      return NextResponse.json({ error: '상품이 지정되지 않았습니다.' }, { status: 400 });
    }

    const supa = await createRouteHandlerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const result = await purchaseCreditsWithNcash({ userId: user.id, packageKey, idempotencyKey });
    if (!result.ok) {
      const status = result.code === 'insufficient_ncash' ? 402 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[/api/credits/purchase/ncash] error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
