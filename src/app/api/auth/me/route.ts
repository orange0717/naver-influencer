import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me — 현재 로그인된 유저 정보 반환
 * 1. Supabase Auth 세션 체크 (우선)
 * 2. 기존 쿠키 기반 체크 (하위 호환)
 */
export async function GET() {
  try {
    // ─── 1. Supabase Auth 세션 체크 ───
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

    if (authUser) {
      const supabase = createServiceClient();
      const { data: profile } = await supabase
        .from('users')
        .select('id, nickname, email, linked_influencer_id, subscription_status')
        .eq('auth_id', authUser.id)
        .single();

      if (profile) {
        // linked_influencer_id가 있으면 인플루언서 이름 조회
        let displayName = profile.nickname || authUser.email?.split('@')[0] || null;
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

        return NextResponse.json({
          type,
          id: naverId || profile.id,
          name: displayName,
          email: authUser.email,
          authId: authUser.id,
        });
      }
    }

    // ─── 2. 기존 쿠키 기반 체크 (하위 호환) ───
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
      // 인플루언서 display_name 조회
      const supabase = createServiceClient();
      const { data: inf } = await supabase
        .from('influencers')
        .select('display_name')
        .eq('naver_id', naverId)
        .single();

      // 체험 남은 일수 계산
      const trialStarted = cookieStore.get('trial_started')?.value;
      let trialDaysLeft: number | undefined;
      if (trialStarted) {
        const elapsed = Date.now() - Number(trialStarted);
        const remaining = Math.ceil((3 * 24 * 60 * 60 * 1000 - elapsed) / (24 * 60 * 60 * 1000));
        trialDaysLeft = Math.max(0, remaining);
      }

      return NextResponse.json({
        type: 'influencer',
        id: naverId,
        name: inf?.display_name || naverId,
        ...(trialDaysLeft !== undefined && { trialDaysLeft }),
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
