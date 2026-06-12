import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

  // 로그인 또는 유효한 데모 세션 필수
  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
