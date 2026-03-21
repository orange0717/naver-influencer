/**
 * 공통 포매팅 유틸리티
 */

/** 숫자를 한국식 약어로 변환 (10000 → 1만, 1500 → 1.5K) */
export function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

/** 날짜를 한국어 형식으로 변환 (2026년 3월 21일) */
export function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}
