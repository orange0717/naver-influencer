import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { clearPostAuthDemoCookies } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sync-cookies
 * Supabase Auth 세션 기반으로 naver_id / user_type 쿠키를 동기화한다.
 * 로그인 직후 호출하여 헤더 닉네임 표시 등에 활용.
 */
export async function POST() {
  try {
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ synced: false });
    }

    const jsonAuthed = (body: Record<string, unknown>) => {
      const r = NextResponse.json(body);
      clearPostAuthDemoCookies(r);
      return r;
    };

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .eq('auth_id', authUser.id)
      .single();

    if (!profile?.linked_influencer_id) {
      return jsonAuthed({ synced: false });
    }

    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id, display_name')
      .eq('id', profile.linked_influencer_id)
      .single();

    if (!inf?.naver_id) {
      return jsonAuthed({ synced: false });
    }

    // 레거시 쿠키 설정
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    };

    cookieStore.set('naver_id', inf.naver_id, cookieOptions);
    cookieStore.set('user_type', 'influencer', cookieOptions);

    return jsonAuthed({
      synced: true,
      naverId: inf.naver_id,
      displayName: inf.display_name,
    });
  } catch {
    return NextResponse.json({ synced: false });
  }
}
