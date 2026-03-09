import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthUser(request);

  if (!auth) {
    return NextResponse.json({ subscribed: false, reason: 'not_logged_in' });
  }

  if (auth.isSubscribed) {
    const sub = await getSubscription(auth.userId);
    return NextResponse.json({
      subscribed: true,
      plan: sub?.plan_name || '월간 구독',
      expiresAt: sub?.expires_at || auth.user.subscription_expires_at,
      autoRenew: sub?.auto_renew ?? true,
    });
  }

  return NextResponse.json({
    subscribed: false,
    reason: 'no_active_subscription',
  });
}
