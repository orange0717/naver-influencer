import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient, createAnonClient } from '@/lib/supabase-server';
import { isAdminFromProfile, isRestricted } from '@/lib/admin';
import { IDENTITY_SIG_COOKIE, verifyIdentity } from '@/lib/identity-cookie';

export const dynamic = 'force-dynamic';

/**
 * DB 조회 자체가 실패했음을 나타내는 오류. "프로필이 없음(비회원/미가입)"과
 * "일시적 백엔드 장애"를 구분하기 위해 사용한다. 장애를 프로필 없음으로 오인하면
 * 정상 로그인 사용자가 회원가입 화면으로 튕긴다(요구사항 #10 D vs E).
 */
class AuthBackendError extends Error {
  constructor() {
    super('auth_backend_unavailable');
    this.name = 'AuthBackendError';
  }
}

/** Supabase Auth 유저로부터 프로필 + 인플루언서 정보를 조회 */
async function getUserFromAuth(authUserId: string, email?: string | null) {
  const supabase = createServiceClient();
  const { data: byAuthId, error: authIdErr } = await supabase
    .from('users')
    .select('id, nickname, email, linked_influencer_id, subscription_plan, subscription_expires_at, blog_id, is_admin')
    .eq('auth_id', authUserId)
    .maybeSingle();
  if (authIdErr) throw new AuthBackendError();
  let profile = byAuthId;

  // auth_id 매칭 실패 시 email로 재조회 (auth.users/public.users 동기화 누락 대비)
  if (!profile && email) {
    const { data: byEmail, error: byEmailErr } = await supabase
      .from('users')
      .select('id, nickname, email, linked_influencer_id, subscription_plan, subscription_expires_at, blog_id, is_admin')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (byEmailErr) throw new AuthBackendError();
    profile = byEmail;
  }

  if (!profile) return null;

  let displayName = profile.nickname || email?.split('@')[0] || null;
  const type = profile.linked_influencer_id ? 'influencer' : 'blogger';
  let naverId: string | null = null;

  if (profile.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('display_name, naver_id')
      .eq('id', profile.linked_influencer_id)
      .single();
    if (inf) {
      displayName = inf.display_name || inf.naver_id || displayName;
      naverId = inf.naver_id;
    }
  }

  // 블로거 타입이면서 blog_id가 있으면 'unified'로 반환 (대시보드 접근용)
  const effectiveType = (!profile.linked_influencer_id && profile.blog_id) ? 'unified' : type;

  const adminFlag = isAdminFromProfile(profile);
  const realActive = !!(
    profile.subscription_plan &&
    profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at) > new Date()
  );
  // 관리자: 모든 유료 기능을 무제한으로 사용 — 가상 Max 플랜 부여
  const subscriptionActive = adminFlag || realActive;
  const effectivePlan = adminFlag
    ? (profile.subscription_plan || 'INFLUENCER')
    : (profile.subscription_plan || null);
  const effectiveExpires = adminFlag
    ? (profile.subscription_expires_at || '2099-12-31T00:00:00Z')
    : (profile.subscription_expires_at || null);

  return {
    type: effectiveType,
    id: naverId || profile.blog_id || profile.id,
    blogId: profile.blog_id || naverId || null,
    name: displayName,
    nickname: profile.nickname ?? null,
    email: email || profile.email,
    authId: authUserId,
    isAdmin: adminFlag,
    restricted: await isRestricted(email || profile.email),
    subscriptionPlan: effectivePlan,
    subscriptionExpiresAt: effectiveExpires,
    subscriptionActive,
  };
}

/**
 * GET /api/auth/me — 현재 로그인된 유저 정보 반환
 * 1. Bearer 토큰 인증 (클라이언트 useAuth 훅)
 * 2. Supabase Auth 세션 쿠키 체크
 * 3. 기존 쿠키 기반 체크 (하위 호환)
 */
export async function GET(request: NextRequest) {
  try {
    // ─── 1. Bearer 토큰 인증 ───
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        const anonClient = createAnonClient();
        const { data: { user: tokenUser } } = await anonClient.auth.getUser(token);
        if (tokenUser) {
          const result = await getUserFromAuth(tokenUser.id, tokenUser.email);
          if (result) return NextResponse.json(result);
        }
      } catch (e) {
        // DB 장애는 "비회원"으로 폴백하지 않고 503 으로 알린다(요구사항 #10 E).
        if (e instanceof AuthBackendError) {
          return NextResponse.json({ error: 'auth_backend_unavailable' }, { status: 503 });
        }
        // 그 외(토큰 검증 실패 등)는 다음 방법으로
      }
    }

    // ─── 2. Supabase Auth 세션 쿠키 체크 ───
    try {
      const supabaseAuth = await createRouteHandlerClient();
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
      if (authUser) {
        const result = await getUserFromAuth(authUser.id, authUser.email);
        if (result) return NextResponse.json(result);
      }
    } catch (e) {
      if (e instanceof AuthBackendError) {
        return NextResponse.json({ error: 'auth_backend_unavailable' }, { status: 503 });
      }
      // Supabase Auth 실패 시 쿠키 기반으로 폴백
    }

    // ─── 3. 기존 쿠키 기반 체크 (하위 호환) ───
    const cookieStore = await cookies();
    const userType = cookieStore.get('user_type')?.value;
    const naverId = cookieStore.get('naver_id')?.value;
    const blogId = cookieStore.get('blog_id')?.value;
    const blogName = cookieStore.get('blog_name')?.value;

    // 위조 방지: 평문 쿠키를 그대로 신원으로 인정하면 아무 naver_id 나 넣어
    // 남의 이름으로 헤더가 뜬다(2026-08-27 감사). 우리가 발급한 서명이 있어야만 인정.
    const identityOk = verifyIdentity(cookieStore.get(IDENTITY_SIG_COOKIE)?.value, {
      userType, naverId, blogId,
    });
    if (!identityOk) {
      return NextResponse.json({ type: null, id: null, name: null });
    }

    const safeDecode = (val: string | undefined): string | null => {
      if (!val) return null;
      try { return decodeURIComponent(val); }
      catch { return val; }
    };

    if (userType === 'unified' && naverId) {
      // DB 검증: 쿠키 조작 방지
      const supabase = createServiceClient();
      const { data: user } = await supabase
        .from('users')
        .select('id, nickname, blog_id, email')
        .or(`blog_id.eq.${naverId},blog_id.eq.${blogId || ''}`)
        .limit(1)
        .single();
      if (!user) return NextResponse.json({ type: null, id: null, name: null });
      return NextResponse.json({
        type: 'unified',
        id: naverId,
        blogId: user.blog_id || blogId || null,
        name: user.nickname || safeDecode(blogName),
        restricted: await isRestricted(user.email),
      });
    }

    if (userType === 'influencer' && naverId) {
      const supabase = createServiceClient();
      const { data: inf } = await supabase
        .from('influencers')
        .select('display_name')
        .eq('naver_id', naverId)
        .single();

      // 등록된 사용자인지 확인하여 제한 여부 체크
      const { data: registeredUser } = await supabase
        .from('users')
        .select('email')
        .or(`blog_id.eq.${naverId},blog_id.eq.${blogId || ''}`)
        .limit(1)
        .single();

      return NextResponse.json({
        type: 'influencer',
        id: naverId,
        blogId: blogId || null,
        name: inf?.display_name || naverId,
        restricted: await isRestricted(registeredUser?.email),
      });
    }

    if (userType === 'blogger' && blogId) {
      // DB 검증: 쿠키 조작 방지
      const supabase = createServiceClient();
      const { data: user } = await supabase
        .from('users')
        .select('id, nickname, email')
        .eq('blog_id', blogId)
        .limit(1)
        .single();
      if (!user) return NextResponse.json({ type: null, id: null, name: null });
      return NextResponse.json({
        type: 'blogger',
        id: blogId,
        name: user.nickname || safeDecode(blogName) || blogId,
        restricted: await isRestricted(user.email),
      });
    }

    return NextResponse.json({ type: null, id: null, name: null });
  } catch (e) {
    // DB 장애(AuthBackendError)는 "비회원"과 구분해 503 으로 응답한다 — 클라이언트가
    // 로그아웃 상태로 오인해 회원가입 화면을 띄우지 않도록.
    if (e instanceof AuthBackendError) {
      return NextResponse.json({ error: 'auth_backend_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ type: null, id: null, name: null });
  }
}
