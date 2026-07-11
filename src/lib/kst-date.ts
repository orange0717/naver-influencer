/** KST(UTC+9) 날짜 유틸 — snapshot_date, 쿼터, 알림 공통 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * KST 기준 달력일 YYYY-MM-DD.
 * 크롤 snapshot_date·일일 쿼터·알림 날짜에 사용 (UTC 자정 경계와 KST 09:00 UTC 전환 시점 정렬).
 */
export function getKSTDateString(atMs = Date.now()): string {
  const kst = new Date(atMs + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

/** @deprecated notifications.ts 호환 — getKSTDateString 사용 권장 */
export function getKSTDate(atMs = Date.now()): Date {
  return new Date(atMs + KST_OFFSET_MS);
}
