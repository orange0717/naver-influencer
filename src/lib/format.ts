/**
 * 공통 포매팅 유틸리티
 */

/** 숫자를 읽기 쉬운 형태로 변환 (1500 → 1,500) */
export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** 큰 숫자를 억/만 단위로 변환 (138109620 → 1.38억) */
export function formatScore(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(2) + '억';
  if (n >= 10_000) return (n / 10_000).toFixed(1) + '만';
  return n.toLocaleString();
}

/** 날짜를 한국어 형식으로 변환 (2026년 3월 21일) */
export function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}
