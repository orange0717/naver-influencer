import { cookies } from 'next/headers';
import { createServiceClient, createAnonClient, createRouteHandlerClient } from './supabase-server';

/**
 * API 라우트에서 인증된 유저 정보를 가져온다.
 * 1순위: Authorization: Bearer <token> 헤더
 * 2순위: 쿠키 기반 세션 (폴백)
 *
 * @returns { authId, userId, user } 또는 null (미인증)
 */
export async function getAuthUser(request: Request) {
  // 1순위: Bearer 토큰 인증
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authUser = null;

  if (token) {
    const anonClient = createAnonClient();
    const { data: { user } } = await anonClient.auth.getUser(token);
    authUser = user;
  }

  // 2순위: 쿠키 기반 세션 (폴백)
  if (!authUser) {
    try {
      const supabaseAuth = await createRouteHandlerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      authUser = user;
    } catch {
      // 쿠키 인증 실패 무시
    }
  }

  if (!authUser) return null;

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, nickname, linked_influencer_id')
    .eq('auth_id', authUser.id)
    .single();

  if (!profile) return null;

  return {
    authId: authUser.id,
    userId: profile.id as string,
    user: profile,
  };
}

/**
 * 쿠키 기반 인증 유저 정보를 가져온다.
 * (인플루언서: naver_id / 블로거: blog_id)
 *
 * @returns { id, type } 또는 null (미인증)
 */
export async function getCookieUser(): Promise<{ id: string; type: 'influencer' | 'blogger' } | null> {
  const cookieStore = await cookies();
  const userType = cookieStore.get('user_type')?.value;
  const naverId = cookieStore.get('naver_id')?.value;
  const blogId = cookieStore.get('blog_id')?.value;

  if (userType === 'influencer' && naverId) {
    return { id: naverId, type: 'influencer' };
  }
  if (userType === 'blogger' && blogId) {
    return { id: blogId, type: 'blogger' };
  }
  return null;
}
