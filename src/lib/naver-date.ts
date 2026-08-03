/**
 * 네이버 블로그 글의 date 필드는 출처마다 포맷이 다르다(RSS ISO 문자열, "2026. 4. 19." 같은
 * 점 구분 표기 등). Date.parse로 먼저 시도하고 실패하면 점 구분 표기를 정규식으로 파싱한다.
 */
export function parseNaverPostDate(s: string): number | null {
  return Date.parse(s) || parseKoreanDotDate(s);
}

function parseKoreanDotDate(s: string): number | null {
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}
