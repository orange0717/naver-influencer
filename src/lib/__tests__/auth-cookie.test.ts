import { describe, it, expect } from 'vitest';
import { hasSupabaseAuthCookieIn, isSupabaseAuthCookie } from '../auth-cookie';

/**
 * 세션 쿠키 판정 회귀 테스트.
 *
 * 이 판정은 두 방향 모두 사고가 난다:
 *   ① 너무 넓으면 — 로그아웃한 사용자가 '세션 확인 중' 로딩 화면에 영구히 갇힌다.
 *      (2026-08-27 실제 사고. @supabase/ssr 이 로그아웃 시 쿠키를 지우는 대신
 *       빈 값으로 덮어쓰는데, 이름만 보고 판정해서 빈 껍데기를 세션으로 셌다.)
 *   ② 너무 좁으면 — 멀쩡히 로그인한 사용자가 게스트 화면을 보고 "내 데이터가 날아갔다"고
 *      오인한다. 애초에 이 함수가 생긴 이유가 그거다.
 *
 * 그래서 아래 두 describe 는 반드시 같이 유지한다. 한쪽만 보고 고치면 반대편이 깨진다.
 */

const REF = 'sb-gppfpmuadpnxmeefomwz-auth-token';

describe('세션이 아닌 쿠키는 세션으로 세지 않는다', () => {
  it('값이 빈 쿠키는 세션이 아니다 — 이게 통과하면 로그아웃한 사용자가 로딩 화면에 갇힌다', () => {
    expect(isSupabaseAuthCookie({ name: REF, value: '' })).toBe(false);
  });

  it.each([
    ['공백뿐', '   '],
    ['value 없음', undefined],
  ])('%s 인 쿠키는 세션이 아니다', (_label, value) => {
    expect(isSupabaseAuthCookie({ name: REF, value })).toBe(false);
  });

  it('빈 청크 쿠키도 세션이 아니다', () => {
    expect(hasSupabaseAuthCookieIn([
      { name: `${REF}.0`, value: '' },
      { name: `${REF}.1`, value: '' },
    ])).toBe(false);
  });

  it('code-verifier 는 세션이 아니다 — 로그인하다 만 사람까지 로딩에 가두면 안 된다', () => {
    expect(isSupabaseAuthCookie({ name: `${REF}-code-verifier`, value: 'abc123' })).toBe(false);
  });

  it.each([
    ['관계없는 쿠키', 'ni_device_id'],
    ['GA', '_ga'],
    ['이름이 sb- 로만 시작', 'sb-something-else'],
  ])('%s 는 세션이 아니다', (_label, name) => {
    expect(isSupabaseAuthCookie({ name, value: 'x' })).toBe(false);
  });

  it('쿠키가 하나도 없으면 세션 없음', () => {
    expect(hasSupabaseAuthCookieIn([])).toBe(false);
  });
});

describe('진짜 세션 쿠키는 절대 놓치지 않는다', () => {
  it('일반 세션 쿠키', () => {
    expect(isSupabaseAuthCookie({ name: REF, value: 'base64-eyJhY2Nlc3NfdG9rZW4iOiJ4In0=' })).toBe(true);
  });

  it('청크로 분할된 세션 쿠키(.0/.1) — 대용량 토큰의 정상 형태', () => {
    expect(hasSupabaseAuthCookieIn([
      { name: `${REF}.0`, value: 'base64-eyJhY2Nl' },
      { name: `${REF}.1`, value: 'c3NfdG9rZW4ifQ==' },
    ])).toBe(true);
  });

  it('빈 껍데기와 진짜 세션이 섞여 있으면 세션 있음으로 본다', () => {
    expect(hasSupabaseAuthCookieIn([
      { name: 'ni_device_id', value: 'abc' },
      { name: `${REF}.0`, value: '' },
      { name: `${REF}.1`, value: 'realtoken' },
    ])).toBe(true);
  });

  it('프로젝트 ref 가 달라도 인식한다 — ref 를 하드코딩하면 환경 바뀔 때 전원 로그아웃된다', () => {
    expect(isSupabaseAuthCookie({ name: 'sb-otherproject-auth-token', value: 'tok' })).toBe(true);
  });
});
