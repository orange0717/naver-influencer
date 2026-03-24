/**
 * 공통 포매팅 유틸리티
 */

/** 숫자를 읽기 쉬운 형태로 변환 (1500 → 1,500) */
export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** 날짜를 한국어 형식으로 변환 (2026년 3월 21일) */
export function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}
