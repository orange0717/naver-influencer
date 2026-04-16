/**
 * 블로그 URL 또는 ID에서 순수 blogId만 추출
 * - https://blog.naver.com/BLOGID → BLOGID
 * - https://m.blog.naver.com/BLOGID → BLOGID
 * - BLOGID → BLOGID (그대로 반환)
 */
export function extractBlogId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

/**
 * blogId가 유효한 네이버 블로그 ID인지 확인
 * UUID나 빈 값이면 false
 */
export function isValidBlogId(blogId: string): boolean {
  if (!blogId || blogId.length === 0) return false;
  // UUID 패턴 (Supabase profile.id)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(blogId)) return false;
  // 네이버 블로그 ID: 영문, 숫자, _, - 조합
  return /^[a-zA-Z0-9_-]+$/.test(blogId);
}
