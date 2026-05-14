import type { NextResponse } from 'next/server';

/**
 * 정식 Supabase 가입·로그인 이후에는 데모 체험 쿠키를 제거한다.
 * 남아 있으면 /my 등에서 구독·체험 만료 판정이 꼬일 수 있다.
 */
export function clearPostAuthDemoCookies(res: NextResponse) {
  res.cookies.delete('demo_mode');
  res.cookies.delete('trial_started');
}
