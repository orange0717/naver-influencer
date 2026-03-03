import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');

  if (!paymentKey || !orderId || !amount) {
    return NextResponse.redirect(new URL('/charge?error=missing_params', request.url));
  }

  // TODO: Verify with Toss Payments API
  // POST https://api.tosspayments.com/v1/payments/confirm
  // Then charge_points()

  // MVP: redirect to charge with success
  return NextResponse.redirect(new URL('/charge?success=true', request.url));
}
