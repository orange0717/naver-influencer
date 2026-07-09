/** 로그아웃 시 제거할 회원 데이터 localStorage 키 접두사 — UI 설정 키(테마 등)는 대상에서 제외 */
const USER_SCOPED_KEY_PREFIXES = [
  'ninfl:dashboard:favorites:v1',
  'blogger_custom_profile_',
  'liked_posts',
];

/** 계정 전환 시 이전 계정의 회원 데이터가 다음 계정에 노출되지 않도록 로그아웃 시점에 정리 */
export function clearUserScopedLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (USER_SCOPED_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => window.localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}
