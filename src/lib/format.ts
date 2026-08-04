/**
 * 공통 포매팅 유틸리티
 */

/** 숫자를 읽기 쉬운 형태로 변환 (1500 → 1,500) */
export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** 숫자를 만 단위로 축약 (10000 이상만 "1.0만" 표기, 그 미만은 천단위 콤마) */
export function formatCountK(n: number | null | undefined): string {
  const v = n || 0;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
  return v.toLocaleString();
}

/** 날짜를 한국어 형식으로 변환 (2026년 3월 21일) */
export function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}

/** 날짜+시각을 "YYYY-MM-DD HH:MM" 형식으로 변환 (값 없으면 '-') */
export function formatDateTimeShort(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 날짜를 "YYYY.MM.DD" 형식으로 변환 */
export function formatDateDot(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
