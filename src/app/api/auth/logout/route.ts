import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { IDENTITY_SIG_COOKIE } from '@/lib/identity-cookie';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — 로그아웃
 * 1. Supabase Auth 세션 종료
 * 2. 기존 쿠키 삭제 (하위 호환)
 */
export async function POST() {
  try {
    // Supabase Auth 세션 종료
    const supabase = await createRouteHandlerClient();
    await supabase.auth.signOut();
  } catch {
    // signOut 실패해도 쿠키는 삭제
  }

  // 기존 쿠키 삭제
  const cookieStore = await cookies();
  cookieStore.delete('naver_id');
  cookieStore.delete('blog_id');
  cookieStore.delete('blog_name');
  cookieStore.delete('user_type');
  cookieStore.delete('demo_mode');
  cookieStore.delete('trial_started');
  cookieStore.delete(IDENTITY_SIG_COOKIE); // 신원 쿠키와 반드시 같이 지운다

  return NextResponse.json({ success: true });
}
