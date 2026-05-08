import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { isTrialExpired } from '@/lib/trial';

export const dynamic = 'force-dynamic';

export default async function RankingsLayout({
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

  // 데모 세션 만료 시 결제 페이지로 — 쿠키 만료 시각이 변조됐을 때 안전장치
  if (isDemo && isTrialExpired(cookieStore.get('trial_started')?.value)) {
    redirect('/subscribe');
  }

  // 무료플랜 포함 모든 페이지는 회원가입/로그인(또는 데모 세션) 필수
  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
