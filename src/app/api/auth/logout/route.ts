import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — 로그아웃 (httpOnly 쿠키 삭제)
 */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('naver_id');
  cookieStore.delete('blog_id');
  cookieStore.delete('blog_name');
  cookieStore.delete('user_type');

  return NextResponse.json({ success: true });
}
