import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';
import Header from './Header';

/** 서버에서 인증 상태를 읽어 Header 클라이언트 컴포넌트에 전달 */
export default async function HeaderWrapper() {
  let serverUser: { type: string; id: string; name: string } | null = null;

  try {
    const cookieStore = await cookies();

    // 1. Supabase Auth 세션 체크
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const { createServerClient } = await import('@supabase/ssr');
      const supabaseAuth = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* read-only */ },
        },
      });

      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (authUser) {
        const supabase = createServiceClient();
        const { data: profile } = await supabase
          .from('users')
          .select('id, nickname, linked_influencer_id')
          .eq('auth_id', authUser.id)
          .single();

        if (profile) {
          let displayName = profile.nickname || authUser.email?.split('@')[0] || '';
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

          serverUser = {
            type: profile.linked_influencer_id ? 'influencer' : 'blogger',
            id: naverId || profile.id,
            name: displayName,
          };
        }
      }
    }

    // 2. 쿠키 기반 폴백
    if (!serverUser) {
      const userType = cookieStore.get('user_type')?.value;
      const naverId = cookieStore.get('naver_id')?.value;

      if (userType === 'influencer' && naverId) {
        const supabase = createServiceClient();
        const { data: inf } = await supabase
          .from('influencers')
          .select('display_name')
          .eq('naver_id', naverId)
          .single();

        serverUser = {
          type: 'influencer',
          id: naverId,
          name: inf?.display_name || naverId,
        };
      }
    }
  } catch {
    // 인증 실패 시 비로그인 상태로 렌더링
  }

  return <Header serverUser={serverUser} />;
}
