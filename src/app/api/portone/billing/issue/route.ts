/**
 * POST /api/portone/billing/issue
 * 빌링키 발급 사전등록 — 클라이언트가 PortOne.requestIssueBillingKey 호출 직전에 받는 paymentId 발급.
 * Body: { planKey: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { preparePortoneIssue } from '@/lib/billing';
import { getPlan } from '@/lib/payment-config';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// 일반 사용자에게 노출 금지 — 관리자만 결제 흐름 검증용으로 호출 가능
const ADMIN_ONLY_PLANS = new Set(['TEST_PAYMENT_100']);

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

    // admin 전용 플랜 검증 (TEST_PAYMENT_100 등)
    if (ADMIN_ONLY_PLANS.has(planKey)) {
      const supabase = createServiceClient();
      const { data: profile } = await supabase
        .from('users')
        .select('id, is_admin')
        .eq('auth_id', user.id)
        .single();
      const adminOk = profile && (profile.is_admin === true || isAdmin(profile.id));
      if (!adminOk) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
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
