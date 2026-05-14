/**
 * 개인정보처리방침 이메일 고지 — 버전·정기 주기 (환경변수)
 * 버전 문자열은 ISO 날짜(YYYY-MM-DD) 권장 (문자열 비교로 신구 판별).
 */

const DEFAULT_POLICY_VERSION = '2026-05-14';
const DEFAULT_REMINDER_MONTHS = 12;

export function getPrivacyPolicyVersion(): string {
  const v = process.env.PRIVACY_POLICY_VERSION?.trim();
  return v || DEFAULT_POLICY_VERSION;
}

export function getPrivacyReminderMonths(): number {
  const raw = process.env.PRIVACY_NOTICE_REMINDER_MONTHS?.trim();
  const n = raw ? parseInt(raw, 10) : DEFAULT_REMINDER_MONTHS;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_REMINDER_MONTHS;
  return Math.min(n, 120);
}

/** from ≤ to 기준으로 완전한 달 수 (같은 달·일 미만이면 한 달 미만으로 처리) */
export function wholeMonthsElapsed(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12;
  months += to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export function isPrivacyReminderDue(
  lastReminderSentAt: string | null | undefined,
  createdAt: string,
  reminderMonths: number,
  now: Date = new Date(),
): boolean {
  const ref = lastReminderSentAt ? new Date(lastReminderSentAt) : new Date(createdAt);
  return wholeMonthsElapsed(ref, now) >= reminderMonths;
}
