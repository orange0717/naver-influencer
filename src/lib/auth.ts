import { cookies } from 'next/headers';
import { createServiceClient, createAnonClient, createRouteHandlerClient } from './supabase-server';
import { IDENTITY_SIG_COOKIE, verifyIdentity } from './identity-cookie';

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
  let { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, nickname, blog_id, linked_influencer_id, is_admin')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  // auth_id 매칭 실패 시 email로 재조회 (auth.users/public.users 동기화 누락 대비)
  if (!profile && authUser.email) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from('users')
      .select('id, nickname, blog_id, linked_influencer_id, is_admin')
      .eq('email', authUser.email.toLowerCase())
      .maybeSingle();
    profile = byEmail;
    profileError = byEmailError;
  }

  // 그래도 실패 시 google_auth_id로 재조회 — 기존 회원이 Google 로그인을
  // 자동매칭으로 연결한 경우, auth_id/email 둘 다 원래 계정과 달라 여기로 온다.
  if (!profile) {
    const { data: byGoogle, error: byGoogleError } = await supabase
      .from('users')
      .select('id, nickname, blog_id, linked_influencer_id, is_admin')
      .eq('google_auth_id', authUser.id)
      .maybeSingle();
    profile = byGoogle;
    profileError = byGoogleError;
  }

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
 * 실제 Supabase 세션에서 신원을 유도한다. 쿠키가 뭐라고 주장하든 무시하고
 * 세션이 가리키는 사람만 반환한다.
 *
 * 서명 없는 옛 쿠키를 들고 있지만 로그인은 멀쩡히 되어 있는 사용자를 위한 경로다.
 * 이게 없으면 배포 순간 기존 로그인 사용자 전원이 재로그인 전까지
 * 채팅·커뮤니티에서 튕긴다(기능을 죽이지 않는다는 원칙 위반).
 */
async function identityFromSession(): Promise<{ id: string; type: 'influencer' | 'blogger' } | null> {
  try {
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
    if (!authUser) return null;

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('users')
      .select('blog_id, linked_influencer_id')
      .eq('auth_id', authUser.id)
      .maybeSingle();
    if (!profile) return null;

    if (profile.linked_influencer_id) {
      const { data: inf } = await supabase
        .from('influencers')
        .select('naver_id')
        .eq('id', profile.linked_influencer_id)
        .maybeSingle();
      if (inf?.naver_id) return { id: inf.naver_id, type: 'influencer' };
    }
    if (profile.blog_id) return { id: profile.blog_id, type: 'blogger' };
    return null;
  } catch {
    return null;
  }
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

  // 위조 방지: 우리가 발급한 쿠키인지 서명으로 확인한다.
  // 이게 없으면 `user_type=influencer; naver_id=남의아이디` 두 줄로 남의 신원이 된다
  // (채팅·커뮤니티 18개 엔드포인트가 이 함수 결과만 믿는다. 제재 회피도 가능했다).
  //
  // 서명이 없거나 안 맞으면 곧바로 차단하지 않고 **진짜 세션**으로 확인한다.
  // 위조범은 세션이 없으니 그대로 막히고, 서명 이전에 로그인해 둔 사용자는 살아남는다.
  const signature = cookieStore.get(IDENTITY_SIG_COOKIE)?.value;
  if (!verifyIdentity(signature, { userType, naverId, blogId })) {
    return await identityFromSession();
  }

  // unified 타입 처리 (인플루언서 핸들 + 블로그 ID 동시 등록 데모 사용자)
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
