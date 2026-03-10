import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';

/**
 * POST /api/payment/confirm — 토스페이먼츠 결제 승인
 * body: { paymentKey, orderId, amount }
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

    // 2. orderId에서 사용자 정보 추출 (형식: NINFL_{userId}_{timestamp})
    const parts = orderId.split('_');
    const userId = parts.length >= 2 ? parts.slice(1, -1).join('_') : '';

    if (!userId) {
      return NextResponse.json({ error: '주문 정보에서 사용자를 찾을 수 없습니다.' }, { status: 400 });
    }

    // 3. 이용권 생성 및 활성화
    const supabase = createServiceClient();
    const now = new Date();
    const durationDays = 30; // 30일 이용권
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
      // 기존 만료일부터 30일 추가
      const currentExpires = new Date(existing[0].expires_at);
      finalExpiresAt = new Date(currentExpires.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    const { error: insertErr } = await supabase.from('licenses').insert({
      license_code: `TOSS-${paymentKey.slice(-12).toUpperCase()}`,
      plan_name: 'PRO',
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
      // 결제는 성공했으므로 에러를 로깅하고 성공 응답
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
        plan_name: 'PRO',
        duration_days: durationDays,
        expires_at: finalExpiresAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[payment/confirm] error:', err);
    return NextResponse.json({ error: '결제 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
