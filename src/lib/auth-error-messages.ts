/**
 * Supabase Auth 는 오류 메시지를 **영문**으로 돌려준다
 * (예: "Invalid login credentials", "Email not confirmed",
 *  "For security purposes, you can only request this after 47 seconds").
 *
 * 이걸 그대로 화면에 뿌리면 한국어 사용자는
 *  - 지금 무슨 상황인지
 *  - 기다려야 하는지 / 메일함을 봐야 하는지 / 다시 가입해야 하는지
 * 를 전혀 알 수 없다. 로그인·회원가입은 이탈이 가장 큰 화면이라 여기서 막히면 그대로 끝난다.
 *
 * 그래서 **영문 원문은 절대 화면에 내보내지 않는다.** 아는 것은 한국어 + 다음 행동으로 바꾸고,
 * 모르는 것은 안전한 기본 문구로 폴백한다(원문은 콘솔에만 남긴다).
 */

type AuthErrorLike = { message?: string | null } | null | undefined;

/** "after 47 seconds" 처럼 서버가 준 실제 대기 초를 뽑는다. 없으면 null — 시간을 임의로 만들어 쓰지 않는다. */
function extractWaitSeconds(msg: string): number | null {
  const m = msg.match(/after\s+(\d+)\s+second/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param err     Supabase 가 돌려준 에러
 * @param fallback 매칭 실패 시 쓸 한국어 문구 (화면마다 다르다)
 */
export function mapSupabaseAuthError(err: AuthErrorLike, fallback: string): string {
  const raw = err?.message ?? '';
  if (!raw) return fallback;

  // 원문은 진단용으로 콘솔에만 남긴다.
  console.error('[auth] supabase error:', raw);

  const m = raw.toLowerCase();

  if (m.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (m.includes('email not confirmed')) {
    return '아직 이메일 인증이 끝나지 않았습니다. 가입할 때 받은 메일(스팸함 포함)의 링크를 먼저 눌러주세요.';
  }
  if (m.includes('already registered') || m.includes('user already exists')) {
    return '이미 가입된 이메일입니다. 로그인해주세요.';
  }
  // 재발송·재시도 쿨다운. 서버가 준 초를 그대로 쓴다.
  if (m.includes('for security purposes') || m.includes('you can only request this after')) {
    const sec = extractWaitSeconds(raw);
    return sec
      ? `보안을 위해 ${sec}초 후에 다시 시도할 수 있습니다.`
      : '보안을 위해 잠시 후에 다시 시도할 수 있습니다.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return '요청이 너무 많아 일시적으로 제한되었습니다. 10분쯤 뒤에 다시 시도해주세요.';
  }
  if (m.includes('password should be') || m.includes('password is too short')) {
    return '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.';
  }
  if (m.includes('new password should be different')) {
    return '기존 비밀번호와 다른 비밀번호를 입력해주세요.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return '현재 회원가입이 일시 중단되었습니다. 잠시 후 다시 시도해주세요.';
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return '이메일 주소를 다시 확인해주세요.';
  }
  if (m.includes('token has expired') || m.includes('invalid or has expired') || m.includes('otp_expired')) {
    return '인증 링크가 만료되었습니다. 다시 요청해주세요.';
  }
  if (m.includes('user not found')) {
    return '가입된 계정을 찾을 수 없습니다. 이메일을 확인하거나 회원가입을 진행해주세요.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) {
    return '네트워크 연결이 불안정합니다. 연결 상태를 확인하고 다시 시도해주세요.';
  }

  return fallback;
}
