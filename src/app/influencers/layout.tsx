import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function InfluencersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

  // 무료플랜 포함 모든 페이지는 회원가입/로그인(또는 데모 세션) 필수
  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
