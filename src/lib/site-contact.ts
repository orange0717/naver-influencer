/**
 * 푸터·문의 안내 등에 노출되는 고객 연락 이메일.
 * Vercel 등에 NEXT_PUBLIC_CONTACT_EMAIL 을 두면 빌드 시 번들에 반영됩니다.
 */
export const CONTACT_EMAIL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()) ||
  'orange@orangelibrary.co.kr';

/**
 * 운영 안내용 네이버 블로그 등 공개 블로그 주소.
 * NEXT_PUBLIC_CONTACT_BLOG_URL 미설정 시 오렌지도서관 기본 블로그.
 */
export const CONTACT_BLOG_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CONTACT_BLOG_URL?.trim()) ||
  'https://blog.naver.com/orangelibrary';

/** 푸터 등에 짧게 보이도록 `https://` 제거한 라벨 */
export function contactBlogLabel(url: string = CONTACT_BLOG_URL): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '') || url;
}
