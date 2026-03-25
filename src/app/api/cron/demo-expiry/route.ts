import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';
import { sendDemoExpiredEmail, sendDemoReminderEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/demo-expiry
 * 매일 실행: 데모 만료 유저에게 이메일 발송
 * 1. 만료 3일 전 리마인더 (reminder_sent_at IS NULL)
 * 2. 만료 후 알림 (expiry_sent_at IS NULL)
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  let reminderCount = 0;
  let expiryCount = 0;

  // ─── 1. 만료 3일 전 리마인더 ───
  const { data: reminderSessions } = await supabase
    .from('demo_sessions')
    .select('id, email, display_name, expires_at')
    .lte('expires_at', threeDaysLater.toISOString())
    .gt('expires_at', now.toISOString())
    .is('reminder_sent_at', null)
    .limit(50);

  for (const session of reminderSessions || []) {
    try {
      const daysLeft = Math.ceil(
        (new Date(session.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      await sendDemoReminderEmail(
        session.email,
        session.display_name || '사용자',
        daysLeft,
      );
      await supabase
        .from('demo_sessions')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', session.id);
      reminderCount++;
    } catch (err) {
      console.error(`[demo-expiry] 리마인더 발송 실패: ${session.email}`, err);
    }
  }

  // ─── 2. 만료 후 알림 ───
  const { data: expiredSessions } = await supabase
    .from('demo_sessions')
    .select('id, email, display_name')
    .lte('expires_at', now.toISOString())
    .is('expiry_sent_at', null)
    .limit(50);

  for (const session of expiredSessions || []) {
    try {
      await sendDemoExpiredEmail(
        session.email,
        session.display_name || '사용자',
      );
      await supabase
        .from('demo_sessions')
        .update({ expiry_sent_at: now.toISOString() })
        .eq('id', session.id);
      expiryCount++;
    } catch (err) {
      console.error(`[demo-expiry] 만료 알림 발송 실패: ${session.email}`, err);
    }
  }

  return NextResponse.json({
    success: true,
    reminderCount,
    expiryCount,
  });
}
