import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { paymentLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { PAYMENT_PLANS } from '@/lib/payment-config';
import { generatePaymentId } from '@/lib/portone';

export const dynamic = 'force-dynamic';

const PORTONE_API_BASE = 'https://api.portone.io';

/**
 * POST /api/portone/prepare
 * 결제 사전등록 — paymentId 발급 + PortOne에 금액 사전등록
 *
 * Body: { planKey: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Rate Limiting
    const ip = getClientIp(req);
    if (await paymentLimiter.check(ip)) return rateLimitResponse();

    // 인증 확인 (Supabase Auth만 허용, 쿠키 인증 제외)
    const authResult = await getAuthUser(req);
    if (!authResult?.userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const userId = authResult.userId;

    // 플랜 검증
    const body = await req.json();
    const planKey = (body.planKey || 'PRO_ANNUAL').trim();
    const plan = PAYMENT_PLANS[planKey];

    if (!plan) {
      return NextResponse.json({ error: '유효하지 않은 플랜입니다.' }, { status: 400 });
    }

    // 0원 플랜 차단
    if (plan.amount <= 0) {
      return NextResponse.json({ error: '아직 가격이 설정되지 않은 플랜입니다.' }, { status: 400 });
    }

    // 환경변수 확인
    const apiSecret = process.env.PORTONE_API_SECRET;
    if (!apiSecret) {
      return NextResponse.json(
        { error: '결제 시스템이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.' },
        { status: 503 },
      );
    }

    // paymentId 생성 (암호학적 랜덤)
    const paymentId = generatePaymentId();

    // PortOne API 사전등록
    const preRegRes = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/pre-register`,
      {
        method: 'POST',
        headers: {
          Authorization: `PortOne ${apiSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          totalAmount: plan.amount,
          taxFreeAmount: 0,
          currency: 'KRW',
        }),
      },
    );

    if (!preRegRes.ok) {
      const errText = await preRegRes.text();
      console.error('[PortOne] 사전등록 실패:', preRegRes.status, errText);
      return NextResponse.json(
        { error: '결제 사전등록에 실패했습니다.' },
        { status: 500 },
      );
    }

    // userId는 클라이언트에 노출하지 않고 customData에서 서버가 관리
    return NextResponse.json({
      paymentId,
      amount: plan.amount,
      orderName: plan.name,
      planKey,
    });
  } catch (error) {
    console.error('[PortOne] prepare error:', error);
    return NextResponse.json(
      { error: '결제 준비 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
