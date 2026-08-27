import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 레거시 신원 쿠키(user_type / naver_id / blog_id) 서명·검증.
 *
 * ⚠️ 왜 필요한가 (2026-08-27 감사에서 발견)
 *   이 쿠키들은 평문이라 브라우저에서 아무 값이나 넣어 보낼 수 있는데,
 *   getCookieUser() 와 /api/auth/me 가 **소유 증명 없이** 그 값을 신원으로 인정했다.
 *   즉 `user_type=influencer; naver_id=남의아이디` 두 줄만으로
 *     · 헤더에 남의 이름이 뜨고
 *     · 채팅·커뮤니티 18개 엔드포인트가 그 사람으로 동작하고
 *     · 채팅 제재(ban)도 naver_id 만 바꾸면 회피됐다.
 *
 * ⚠️ 그렇다고 쿠키 로그인을 걷어내지 않는다.
 *   18개 엔드포인트가 이 경로에 의존하고 있어서 걷어내면 기능이 통째로 죽는다.
 *   대신 "우리가 발급한 쿠키인지"만 검증한다 — 기능은 그대로, 위조만 막는다.
 *
 * 발급처는 코드베이스 전체에서 /api/auth/sync-cookies 하나뿐이고,
 * 거기서는 이미 Supabase 세션을 확인한 뒤에만 쿠키를 굽는다. 따라서 서명을 요구해도
 * "정상 로그인으로 발급된 쿠키"는 전부 통과한다.
 *
 * 영향: 서명 없는 옛 쿠키만 들고 있고 Supabase 세션은 만료된 사용자는 재로그인이 필요하다.
 *   (이미 인증이 끊긴 상태이므로 되찾아주는 게 아니라 원래 막혔어야 할 접근이다.)
 */

/** 서명 쿠키 이름 — user_type/naver_id/blog_id 와 함께 굽고 함께 지운다. */
export const IDENTITY_SIG_COOKIE = 'identity_sig';

/**
 * 전용 시크릿이 없으면 서버 전용 키에서 파생한다(Vercel 환경변수 추가 없이 적용 가능).
 * 서비스 키를 그대로 쓰지 않고 HMAC 으로 한 번 감싸서 파생한다.
 */
function hmacKey(): Buffer | null {
  const dedicated = process.env.IDENTITY_COOKIE_SECRET;
  if (dedicated) return Buffer.from(dedicated, 'utf8');
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) return null;
  return createHmac('sha256', fallback).update('ninfle-identity-cookie-v1').digest();
}

/** 서명 대상 문자열 — 필드 하나만 바꿔치기하는 조합 공격을 막으려 전부 묶어서 서명한다. */
export function identityPayload(parts: {
  userType?: string | null;
  naverId?: string | null;
  blogId?: string | null;
}): string {
  // 구분자로 단순 join 을 쓰면 경계가 모호해진다(naverId="a b" 와 naverId="a",blogId="b" 가
  // 같은 문자열이 됨). 값마다 길이를 앞에 붙여 조합이 유일하게 결정되도록 한다.
  return [parts.userType ?? '', parts.naverId ?? '', parts.blogId ?? '']
    .map((v) => `${v.length}:${v}`)
    .join('|');
}

export function signIdentity(parts: {
  userType?: string | null;
  naverId?: string | null;
  blogId?: string | null;
}): string | null {
  const key = hmacKey();
  if (!key) return null;
  return createHmac('sha256', key).update(identityPayload(parts)).digest('base64url');
}

/**
 * 쿠키 조합이 우리가 발급한 것인지 검증한다.
 *
 * 시크릿이 아예 없는 환경(로컬 등)에서는 검증할 방법이 없다. 이때 통과시키면
 * 프로덕션에서 시크릿이 빠졌을 때 조용히 구멍이 열리므로 **차단**한다(fail closed).
 */
export function verifyIdentity(
  signature: string | undefined | null,
  parts: { userType?: string | null; naverId?: string | null; blogId?: string | null },
): boolean {
  if (!signature) return false;
  const expected = signIdentity(parts);
  if (!expected) return false;
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
