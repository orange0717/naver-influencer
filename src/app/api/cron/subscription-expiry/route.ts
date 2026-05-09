import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';
import { sendSubscriptionExpiredEmail, sendSubscriptionReminderEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/subscription-expiry
 * 매일 1회 실행:
 *  1. 만료 7일 전(±12h 윈도우) 사용자에게 리마인더
 *  2. 만료 당일(±12h 윈도우) 사용자에게 만료 알림
 *
 * 윈도우 방식이라 알림 발송 컬럼 없이도 1회만 발송됨.
 * cron 실패한 날의 사용자는 못 받음 — 수용 가능한 트레이드오프.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const HALF_DAY_MS = 12 * 60 * 60 * 1000;
  const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;

  // 리마인더 윈도우: 만료 7일 전 ±12h
  const reminderStart = new Date(now.getTime() + SEVEN_DAY_MS - HALF_DAY_MS);
  const reminderEnd = new Date(now.getTime() + SEVEN_DAY_MS + HALF_DAY_MS);

  // 만료 알림 윈도우: 만료 당일 ±12h
  const expiredStart = new Date(now.getTime() - HALF_DAY_MS);
  const expiredEnd = new Date(now.getTime() + HALF_DAY_MS);

  let reminderCount = 0;
  let expiredCount = 0;

  // ─── 1. 리마인더 ───
  const { data: reminderUsers } = await supabase
    .from('users')
    .select('id, email, nickname, subscription_plan, subscription_expires_at')
    .not('subscription_plan', 'is', null)
    .gte('subscription_expires_at', reminderStart.toISOString())
    .lt('subscription_expires_at', reminderEnd.toISOString())
    .limit(200);

  for (const user of reminderUsers || []) {
    if (!user.email) continue;
    try {
      const daysLeft = Math.ceil(
        (new Date(user.subscription_expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      await sendSubscriptionReminderEmail(
        user.email,
        user.nickname || '회원',
        daysLeft,
        user.subscription_expires_at,
      );
      reminderCount++;
    } catch (err) {
      console.error(`[subscription-expiry] 리마인더 실패: ${user.email}`, err);
    }
  }

  // ─── 2. 만료 당일 알림 ───
  const { data: expiredUsers } = await supabase
    .from('users')
    .select('id, email, nickname, subscription_plan, subscription_expires_at')
    .not('subscription_plan', 'is', null)
    .gte('subscription_expires_at', expiredStart.toISOString())
    .lt('subscription_expires_at', expiredEnd.toISOString())
    .limit(200);

  for (const user of expiredUsers || []) {
    if (!user.email) continue;
    try {
      await sendSubscriptionExpiredEmail(user.email, user.nickname || '회원');
      expiredCount++;
    } catch (err) {
      console.error(`[subscription-expiry] 만료 알림 실패: ${user.email}`, err);
    }
  }

  return NextResponse.json({
    success: true,
    reminderCount,
    expiredCount,
  });
}
