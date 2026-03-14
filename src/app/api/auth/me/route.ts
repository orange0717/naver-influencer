import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me — 현재 로그인된 유저 정보 반환 (httpOnly 쿠키 기반)
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userType = cookieStore.get('user_type')?.value;
    const naverId = cookieStore.get('naver_id')?.value;
    const blogId = cookieStore.get('blog_id')?.value;
    const blogName = cookieStore.get('blog_name')?.value;

    if (userType === 'influencer' && naverId) {
      return NextResponse.json({
        type: 'influencer',
        id: naverId,
        name: null,
      });
    }

    if (userType === 'blogger' && blogId) {
      return NextResponse.json({
        type: 'blogger',
        id: blogId,
        name: blogName ? decodeURIComponent(blogName) : blogId,
      });
    }

    return NextResponse.json({ type: null, id: null, name: null });
  } catch {
    return NextResponse.json({ type: null, id: null, name: null });
  }
}
