import { parseNaverBlogPostUrl } from './naver-blog-url';

/**
 * 블로그 URL 또는 ID에서 순수 blogId만 추출해 정규화한다.
 * 네이버 블로그 blogId 파싱/정규화의 단일 진입점 — 다른 곳에서 별도 정규식을 만들지 말고 이 함수를 사용할 것.
 *
 * 지원 입력 형태:
 * - https://blog.naver.com/BLOGID → blogid
 * - https://m.blog.naver.com/BLOGID → blogid
 * - https://blog.naver.com/BLOGID/123456789 (포스트 경로) → blogid
 * - https://blog.naver.com/PostView.naver?blogId=BLOGID&logNo=123 → blogid
 * - @BLOGID, BLOGID → blogid
 *
 * 정규화 규칙: '@' 접두사 제거 + 소문자 변환 (대소문자·표기 차이로 동일 사용자가
 * 다른 blogId 문자열로 저장되는 것을 방지하기 위한 표준 규칙)
 */
export function extractBlogId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // 포스트 URL (경로형 /{blogId}/{postNo}, PostView.naver?blogId=...) 우선 시도.
  // 프로토콜이 없는 입력(blog.naver.com/foo)도 지원하기 위해 필요 시 보정한다.
  const maybeUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const postParsed = parseNaverBlogPostUrl(maybeUrl);
  if (postParsed) return normalizeBlogId(postParsed.blogId);

  // 프로필 URL (포스트 경로 없이 blogId만 있는 형태)
  const urlMatch = trimmed.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([^/?#]+)/i);
  if (urlMatch) return normalizeBlogId(urlMatch[1]);

  // 순수 ID 입력 (@ 접두사 허용)
  return normalizeBlogId(trimmed);
}

function normalizeBlogId(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase();
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
