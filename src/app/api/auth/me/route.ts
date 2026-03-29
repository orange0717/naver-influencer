import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient, createAnonClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** Supabase Auth 유저로부터 프로필 + 인플루언서 정보를 조회 */
async function getUserFromAuth(authUserId: string, email?: string | null) {
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, nickname, email, linked_influencer_id, subscription_status')
    .eq('auth_id', authUserId)
    .single();

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

  return {
    type,
    id: naverId || profile.id,
    name: displayName,
    email: email || profile.email,
    authId: authUserId,
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
      return NextResponse.json({
        type: 'unified',
        id: naverId,
        blogId: blogId || null,
        name: safeDecode(blogName),
      });
    }

    if (userType === 'influencer' && naverId) {
      const supabase = createServiceClient();
      const { data: inf } = await supabase
        .from('influencers')
        .select('display_name')
        .eq('naver_id', naverId)
        .single();

      const trialStarted = cookieStore.get('trial_started')?.value;
      const isDemo = cookieStore.get('demo_mode')?.value === 'true';
      const durationDays = isDemo ? 7 : 3;
      let trialDaysLeft: number | undefined;
      if (trialStarted) {
        const elapsed = Date.now() - Number(trialStarted);
        const remaining = Math.ceil((durationDays * 24 * 60 * 60 * 1000 - elapsed) / (24 * 60 * 60 * 1000));
        trialDaysLeft = Math.max(0, remaining);
      }

      return NextResponse.json({
        type: 'influencer',
        id: naverId,
        name: inf?.display_name || naverId,
        ...(trialDaysLeft !== undefined && { trialDaysLeft }),
        ...(isDemo && { isDemo: true }),
      });
    }

    if (userType === 'blogger' && blogId) {
      return NextResponse.json({
        type: 'blogger',
        id: blogId,
        name: safeDecode(blogName) || blogId,
      });
    }

    return NextResponse.json({ type: null, id: null, name: null });
  } catch {
    return NextResponse.json({ type: null, id: null, name: null });
  }
}
