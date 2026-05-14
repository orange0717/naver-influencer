import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';
import {
  sendPrivacyAnnualReminderEmail,
  sendPrivacyPolicyUpdateEmail,
} from '@/lib/email';
import {
  getPrivacyPolicyVersion,
  getPrivacyReminderMonths,
  isPrivacyReminderDue,
} from '@/lib/privacy-notice';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BATCH_LIMIT = 80;
const RESEND_DELAY_MS = 350;

type UserRow = {
  id: string;
  email: string | null;
  nickname: string | null;
  last_privacy_policy_version_ack: string | null;
  last_privacy_reminder_sent_at: string | null;
  created_at: string;
  notification_settings:
    | { privacy_notice_email: boolean | null }
    | { privacy_notice_email: boolean | null }[]
    | null;
};

function privacyNoticeEnabled(row: UserRow): boolean {
  const raw = row.notification_settings;
  const ns = Array.isArray(raw) ? raw[0] : raw;
  if (!ns) return true;
  return ns.privacy_notice_email !== false;
}

function displayName(row: UserRow): string {
  const nick = row.nickname?.trim();
  if (nick) return nick;
  const em = row.email?.split('@')[0];
  return em || '회원';
}

/**
 * GET /api/cron/privacy-notices
 * 1) 이메일 있는 회원 중 ack NULL → 현재 버전으로 백필(메일 없음)
 * 2) ack ≠ 현재 버전 → 개정 안내 메일 (우선)
 * 3) 그 외 정기 주기 경과 → 정기 안내 메일
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'RESEND_API_KEY not set',
    });
  }

  const version = getPrivacyPolicyVersion();
  const reminderMonths = getPrivacyReminderMonths();
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const now = new Date();

  const { error: backfillError } = await supabase
    .from('users')
    .update({ last_privacy_policy_version_ack: version, updated_at: nowIso })
    .is('last_privacy_policy_version_ack', null)
    .not('email', 'is', null);

  if (backfillError) {
    console.error('[privacy-notices] ack 백필 실패:', backfillError.message);
    return NextResponse.json({ success: false, error: backfillError.message }, { status: 500 });
  }

  const { data: rows, error: fetchError } = await supabase
    .from('users')
    .select(
      `id, email, nickname, last_privacy_policy_version_ack, last_privacy_reminder_sent_at, created_at,
       notification_settings(privacy_notice_email)`,
    )
    .not('email', 'is', null);

  if (fetchError) {
    console.error('[privacy-notices] 조회 실패:', fetchError.message);
    return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
  }

  type Work = { row: UserRow; kind: 'material' | 'reminder' };
  const queue: Work[] = [];

  for (const r of (rows || []) as UserRow[]) {
    if (!r.email?.trim()) continue;
    if (!privacyNoticeEnabled(r)) continue;

    const ack = r.last_privacy_policy_version_ack;
    if (ack != null && ack !== version) {
      queue.push({ row: r, kind: 'material' });
    } else if (
      ack === version &&
      isPrivacyReminderDue(r.last_privacy_reminder_sent_at, r.created_at, reminderMonths, now)
    ) {
      queue.push({ row: r, kind: 'reminder' });
    }
  }

  queue.sort((a, b) => (a.kind === 'material' ? 0 : 1) - (b.kind === 'material' ? 0 : 1));
  const batch = queue.slice(0, BATCH_LIMIT);

  let materialSent = 0;
  let reminderSent = 0;
  let errors = 0;

  for (const { row, kind } of batch) {
    const name = displayName(row);
    try {
      if (kind === 'material') {
        await sendPrivacyPolicyUpdateEmail(row.email!, name, version);
        await supabase
          .from('users')
          .update({
            last_privacy_policy_version_ack: version,
            last_privacy_reminder_sent_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', row.id);
        materialSent++;
      } else {
        await sendPrivacyAnnualReminderEmail(row.email!, name);
        await supabase
          .from('users')
          .update({
            last_privacy_reminder_sent_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', row.id);
        reminderSent++;
      }
    } catch (e) {
      errors++;
      console.error(`[privacy-notices] 발송 실패 (${row.email}):`, e);
    }
    await new Promise(res => setTimeout(res, RESEND_DELAY_MS));
  }

  return NextResponse.json({
    success: true,
    version,
    reminderMonths,
    queued: queue.length,
    processed: batch.length,
    materialSent,
    reminderSent,
    errors,
  });
}
