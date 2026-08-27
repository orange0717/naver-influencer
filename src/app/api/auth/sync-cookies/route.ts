import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { IDENTITY_SIG_COOKIE, signIdentity } from '@/lib/identity-cookie';

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
      // 정식 로그인 후 잔존 데모 브라우징 쿠키 제거
      r.cookies.delete('demo_mode');
      r.cookies.delete('trial_started');
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

    // 위조 방지 서명. 이 쿠키들은 평문이라 브라우저에서 아무 값이나 넣을 수 있는데,
    // getCookieUser() 가 그 값을 그대로 신원으로 인정하기 때문에 발급 시점에 서명해 둔다.
    // (여기는 위에서 Supabase 세션을 확인한 뒤이므로 서명해도 되는 자리다.)
    const signature = signIdentity({
      userType: 'influencer',
      naverId: inf.naver_id,
      blogId: cookieStore.get('blog_id')?.value,
    });
    if (signature) cookieStore.set(IDENTITY_SIG_COOKIE, signature, cookieOptions);

    return jsonAuthed({
      synced: true,
      naverId: inf.naver_id,
      displayName: inf.display_name,
    });
  } catch {
    return NextResponse.json({ synced: false });
  }
}
