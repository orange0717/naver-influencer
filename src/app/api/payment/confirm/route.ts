import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { parsePlanFromOrderId, findPeriod, PLANS, calculatePrice } from '@/lib/plans';
import { validateBody } from '@/lib/validations';
import { paymentConfirmSchema } from '@/lib/validations/payment';
import { paymentLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

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
    const ip = getClientIp(req);
    if (paymentLimiter.check(ip)) return rateLimitResponse();

    const body = await req.json();
    const v = validateBody(paymentConfirmSchema, body);
    if (!v.success) return v.response;

    const { paymentKey, orderId, amount } = v.data;

    // 1. 토스페이먼츠 결제 승인 API 호출
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let confirmRes: Response;
    try {
      confirmRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payment = await confirmRes.json();

    if (!confirmRes.ok) {
      console.error('[payment/confirm] 토스 승인 실패:', { orderId, status: confirmRes.status, message: payment.message });
      return NextResponse.json(
        { error: '결제 승인에 실패했습니다.' },
        { status: 400 },
      );
    }

    // 2. orderId에서 플랜 정보 추출
    // 형식: NINFL_{planName}_{months}M_{userId}_{timestamp}
    const planInfo = parsePlanFromOrderId(orderId);

    if (!planInfo) {
      console.error(`[payment/confirm] 잘못된 orderId 형식: ${orderId}`);
      return NextResponse.json({ error: '주문 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const plan = PLANS[planInfo.planName];
    if (!plan) {
      return NextResponse.json({ error: '존재하지 않는 플랜입니다.' }, { status: 400 });
    }

    const period = findPeriod(planInfo.months);
    if (!period) {
      return NextResponse.json({ error: '유효하지 않은 결제 기간입니다.' }, { status: 400 });
    }

    const planName = planInfo.planName;
    const durationDays = period.days;

    // 결제 금액 서버 검증
    const expectedAmount = calculatePrice(plan.basePrice, planInfo.months, period.discount);
    if (amount !== expectedAmount) {
      console.error(`[payment/confirm] 금액 불일치: 요청 ${amount}원, 예상 ${expectedAmount}원`);
      return NextResponse.json(
        { error: '결제 금액이 일치하지 않습니다.' },
        { status: 400 },
      );
    }

    // 3. userId 추출: NINFL_{planName}_{months}M_{userId}_{timestamp}
    // 형식 검증: NINFL_PRO_1M_uuid_timestamp 또는 NINFL_PRO_12M_uuid_timestamp
    const orderIdRegex = /^NINFL_(PERSONAL|INFLUENCER|AGENCY|PRO)_(\d+)M_([a-f0-9-]+)_(\d{10,13})$/;
    const orderMatch = orderId.match(orderIdRegex);
    if (!orderMatch) {
      return NextResponse.json({ error: '주문 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const userId = orderMatch[3];

    if (!userId || userId.length < 1 || userId.length > 128) {
      return NextResponse.json({ error: '주문 정보에서 사용자를 찾을 수 없습니다.' }, { status: 400 });
    }

    // 4. 이용권 생성 및 활성화
    const supabase = createServiceClient();

    // 멱등성 체크: 동일 orderId로 이미 처리된 결제인지 확인
    const { data: existingLicense } = await supabase
      .from('licenses')
      .select('id, plan_name, expires_at')
      .eq('order_id', orderId)
      .single();

    if (existingLicense) {
      return NextResponse.json({
        success: true,
        payment: { orderId, totalAmount: amount, method: 'already_processed' },
        license: {
          plan_name: existingLicense.plan_name,
          duration_days: durationDays,
          expires_at: existingLicense.expires_at,
        },
        duplicate: true,
      });
    }
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
