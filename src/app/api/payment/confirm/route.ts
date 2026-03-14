import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { parsePlanFromOrderId, findPeriod, PLANS, calculatePrice } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';

/**
 * POST /api/payment/confirm — 토스페이먼츠 결제 승인
 * body: { paymentKey, orderId, amount }
 *
 * orderId 형식: NINFL_{planName}_{months}M_{userId}_{timestamp}
 */
export async function POST(req: NextRequest) {
  try {
    const { paymentKey, orderId, amount } = await req.json();

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 });
    }

    // 1. 토스페이먼츠 결제 승인 API 호출
    const confirmRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const payment = await confirmRes.json();

    if (!confirmRes.ok) {
      console.error('[payment/confirm] 토스 승인 실패:', payment);
      return NextResponse.json(
        { error: payment.message || '결제 승인에 실패했습니다.' },
        { status: 400 },
      );
    }

    // 2. orderId에서 플랜 정보 추출
    // 새 형식: NINFL_{planName}_{months}M_{userId}_{timestamp}
    // 레거시: NINFL_{userId}_{timestamp}
    const planInfo = parsePlanFromOrderId(orderId);

    let planName: string;
    let durationDays: number;

    if (planInfo) {
      // 새 형식
      planName = planInfo.planName;
      const period = findPeriod(planInfo.months);
      durationDays = period?.days || planInfo.months * 30;

      // 결제 금액 서버 검증 — plans.ts 가격과 대조
      const plan = PLANS[planInfo.planName];
      if (plan) {
        const expectedAmount = calculatePrice(plan.basePrice, planInfo.months, period?.discount || 0);
        if (amount !== expectedAmount) {
          console.error(`[payment/confirm] 금액 불일치: 요청 ${amount}원, 예상 ${expectedAmount}원, orderId=${orderId}`);
          return NextResponse.json(
            { error: `결제 금액이 일치하지 않습니다. (요청: ${amount}원, 예상: ${expectedAmount}원)` },
            { status: 400 },
          );
        }
      }
    } else {
      // 레거시 형식 (기존 호환)
      planName = 'PRO';
      durationDays = 30;
    }

    // 3. userId 추출
    let userId: string;
    if (planInfo) {
      // 새 형식: NINFL_PRO_3M_{userId}_{timestamp}
      const parts = orderId.split('_');
      // NINFL, planName, monthsM, ...userId parts..., timestamp
      userId = parts.slice(3, -1).join('_');
    } else {
      // 레거시: NINFL_{userId}_{timestamp}
      const parts = orderId.split('_');
      userId = parts.slice(1, -1).join('_');
    }

    if (!userId) {
      return NextResponse.json({ error: '주문 정보에서 사용자를 찾을 수 없습니다.' }, { status: 400 });
    }

    // 4. 이용권 생성 및 활성화
    const supabase = createServiceClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // 기존 활성 이용권이 있으면 만료일 연장
    const { data: existing } = await supabase
      .from('licenses')
      .select('*')
      .eq('buyer_id', userId)
      .eq('is_used', true)
      .gt('expires_at', now.toISOString())
      .order('expires_at', { ascending: false })
      .limit(1);

    let finalExpiresAt = expiresAt;
    if (existing && existing.length > 0) {
      const currentExpires = new Date(existing[0].expires_at);
      finalExpiresAt = new Date(currentExpires.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    const { error: insertErr } = await supabase.from('licenses').insert({
      license_code: `TOSS-${paymentKey.slice(-12).toUpperCase()}`,
      plan_name: planName,
      duration_days: durationDays,
      price: amount,
      buyer_id: userId,
      buyer_name: userId,
      is_used: true,
      activated_at: now.toISOString(),
      expires_at: finalExpiresAt.toISOString(),
      order_id: orderId,
    });

    if (insertErr) {
      console.error('[payment/confirm] DB 저장 실패:', insertErr);
    }

    return NextResponse.json({
      success: true,
      payment: {
        orderId: payment.orderId,
        totalAmount: payment.totalAmount,
        method: payment.method,
        approvedAt: payment.approvedAt,
      },
      license: {
        plan_name: planName,
        duration_days: durationDays,
        expires_at: finalExpiresAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[payment/confirm] error:', err);
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
