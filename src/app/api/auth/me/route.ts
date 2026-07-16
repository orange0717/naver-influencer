import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient, createAnonClient } from '@/lib/supabase-server';
import { isAdminFromProfile, isRestricted } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** Supabase Auth 유저로부터 프로필 + 인플루언서 정보를 조회 */
async function getUserFromAuth(authUserId: string, email?: string | null) {
  const supabase = createServiceClient();
  let { data: profile } = await supabase
    .from('users')
    .select('id, nickname, email, linked_influencer_id, subscription_plan, subscription_expires_at, blog_id, is_admin')
    .eq('auth_id', authUserId)
    .maybeSingle();

  // auth_id 매칭 실패 시 email로 재조회 (auth.users/public.users 동기화 누락 대비)
  if (!profile && email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id, nickname, email, linked_influencer_id, subscription_plan, subscription_expires_at, blog_id, is_admin')
      .eq('email', email.toLowerCase())
      .maybeSingle();
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
  // 관리자: 모든 유료 기능을 무제한으로 사용 — 가상 INFLUENCER 플랜 부여
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
      } catch {
        // Bearer 토큰 실패 시 다음 방법으로
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
    } catch {
      // Supabase Auth 실패 시 쿠키 기반으로 폴백
    }

    // ─── 3. 기존 쿠키 기반 체크 (하위 호환) ───
    const cookieStore = await cookies();
    const userType = cookieStore.get('user_type')?.value;
    const naverId = cookieStore.get('naver_id')?.value;
    const blogId = cookieStore.get('blog_id')?.value;
    const blogName = cookieStore.get('blog_name')?.value;

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

      const trialStarted = cookieStore.get('trial_started')?.value;
      const isDemo = cookieStore.get('demo_mode')?.value === 'true';
      // 데모/체험 모두 7일 통일 (TRIAL_DAYS·DEMO_DAYS 와 일치)
      const durationDays = 7;
      let trialDaysLeft: number | undefined;
      if (trialStarted) {
        const elapsed = Date.now() - Number(trialStarted);
        const remaining = Math.ceil((durationDays * 24 * 60 * 60 * 1000 - elapsed) / (24 * 60 * 60 * 1000));
        trialDaysLeft = Math.max(0, remaining);
      }

      return NextResponse.json({
        type: 'influencer',
        id: naverId,
        blogId: blogId || null,
        name: inf?.display_name || naverId,
        restricted: await isRestricted(registeredUser?.email),
        ...(trialDaysLeft !== undefined && { trialDaysLeft }),
        ...(isDemo && { isDemo: true }),
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
  } catch {
    return NextResponse.json({ type: null, id: null, name: null });
  }
}
