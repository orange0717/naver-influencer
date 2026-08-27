/**
 * Supabase 세션 쿠키 판정 — 서버(supabase-server.ts)와 미들웨어(middleware.ts)가
 * 공유하는 단일 규칙. `next/headers` 를 import 하지 않는 순수 함수라 테스트가 가능하다.
 *
 * ⚠️ 이 판정은 "로그인 흔적이 있는가"에만 쓴다. 실제 인증은 getUser 가 한다.
 *   여기서 true 가 나오면 코드가 "이 사람은 로그인했는데 Auth 응답이 늦은 것"으로 보고
 *   게스트 화면 대신 '세션 확인 중' 로딩을 띄운다. 즉 오탐이 나면 **비로그인 사용자가
 *   영원히 로딩 화면에 갇힌다**.
 *
 * 2026-08-27 실제 사고:
 *   `sb-<ref>-auth-token=` — 이름은 있고 **값이 빈** 쿠키가 남은 상태에서 /my 에 들어가면
 *   "로그인 세션을 확인하는 중입니다…" 에서 영구 정지했다(새로고침해도 동일).
 *   @supabase/ssr 은 로그아웃·토큰 폐기 시 쿠키를 지우는 대신 **빈 값으로 덮어쓴다**.
 *   그런데 기존 판정은 `c.name` 만 보고 `c.value` 를 보지 않아서, 로그아웃한 사용자가
 *   그 빈 껍데기를 계속 들고 다니며 로그인 안내조차 못 받았다.
 *
 * 그래서 두 가지를 함께 지킨다:
 *   1) 값이 비어 있으면 세션이 아니다.
 *   2) 이름은 `sb-<ref>-auth-token` 또는 청크 `sb-<ref>-auth-token.0` 형태로 **완전 일치**해야 한다.
 *      접미사를 허용하면 OAuth 진행 중에만 쓰는 `sb-<ref>-auth-token-code-verifier` 가 걸려서,
 *      로그인하다 만 사람도 같은 무한 로딩에 빠진다.
 */
const AUTH_TOKEN_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function isSupabaseAuthCookie(cookie: { name: string; value?: string }): boolean {
  if (!AUTH_TOKEN_COOKIE.test(cookie.name)) return false;
  return (cookie.value ?? '').trim().length > 0;
}

export function hasSupabaseAuthCookieIn(
  cookies: readonly { name: string; value?: string }[],
): boolean {
  return cookies.some(isSupabaseAuthCookie);
}
