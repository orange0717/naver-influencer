/**
 * POST /api/portone/billing/issue
 * 빌링키 발급 사전등록 — 클라이언트가 PortOne.requestIssueBillingKey 호출 직전에 받는 paymentId 발급.
 * Body: { planKey: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { preparePortoneIssue } from '@/lib/billing';
import { getPlan } from '@/lib/payment-config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { planKey } = (await req.json()) as { planKey?: string };
    if (!planKey || !getPlan(planKey)) {
      return NextResponse.json({ error: '유효하지 않은 플랜입니다.' }, { status: 400 });
    }

    const supa = await createRouteHandlerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const result = await preparePortoneIssue(user.id, planKey);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[/api/portone/billing/issue] error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
