import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const message = searchParams.get('message');

  return NextResponse.redirect(
    new URL(`/charge?error=${encodeURIComponent(message || code || 'payment_failed')}`, request.url),
  );
}
