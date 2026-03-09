import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createAnonClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');

  if (!paymentKey || !orderId || !amount) {
    return NextResponse.redirect(new URL('/charge?error=missing_params', request.url));
  }

  // orderId에서 userId와 포인트 금액 추출 (orderId 형식: {userId}_{points}_{timestamp})
  const parts = orderId.split('_');
  if (parts.length < 2) {
    return NextResponse.redirect(new URL('/charge?error=invalid_order', request.url));
  }

  const userId = parts[0];
  const pointAmount = parseInt(parts[1]) || 0;

  if (!pointAmount) {
    return NextResponse.redirect(new URL('/charge?error=invalid_amount', request.url));
  }

  // TODO: Toss Payments API로 결제 검증
  // const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ paymentKey, orderId, amount: parseInt(amount) }),
  // });

  // 포인트 충전 (RPC)
  const supabase = createServiceClient();
  const { error } = await supabase.rpc('charge_points', {
    p_user_id: userId,
    p_amount: pointAmount,
    p_description: `${pointAmount}P 충전 (${paymentKey})`,
  });

  if (error) {
    return NextResponse.redirect(new URL('/charge?error=charge_failed', request.url));
  }

  return NextResponse.redirect(new URL('/charge?success=true', request.url));
}
