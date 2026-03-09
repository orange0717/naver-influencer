import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { activateSubscription } from '@/lib/subscription';

export async function POST(request: NextRequest) {
  const auth = await getAuthUser(request);

  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const body = await request.json();
  const { paymentKey, paymentMethod } = body;

  if (!paymentKey) {
    return NextResponse.json({ error: 'paymentKey가 필요합니다' }, { status: 400 });
  }

  const result = await activateSubscription(
    auth.userId,
    paymentKey,
    paymentMethod || 'tosspay',
  );

  if (result && 'error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}
