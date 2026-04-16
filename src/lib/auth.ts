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
    } catch (err) {
      console.warn('[auth] cookie auth failed:', err instanceof Error ? err.message : err);
    }
  }

  if (!authUser) return null;

  const supabase = createServiceClient();
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, nickname, linked_influencer_id')
    .eq('auth_id', authUser.id)
    .single();

  if (profileError || !profile) {
    if (profileError) console.error('[auth] user profile lookup failed:', profileError.message);
    return null;
  }

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

  // unified 타입 처리 (네이버 로그인 + 블로그 연동 사용자)
  if (userType === 'unified' && naverId) {
    return { id: naverId, type: 'influencer' };
  }
  if (userType === 'influencer' && naverId) {
    // 데모 세션 만료 검증
    const supabase = createServiceClient();
    const { data: demo } = await supabase
      .from('demo_sessions')
      .select('expires_at')
      .eq('naver_id', naverId)
      .not('verified_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (demo && new Date(demo.expires_at) < new Date()) {
      return null; // 데모 만료
    }
    return { id: naverId, type: 'influencer' };
  }
  if (userType === 'blogger' && blogId) {
    return { id: blogId, type: 'blogger' };
  }
  return null;
}
