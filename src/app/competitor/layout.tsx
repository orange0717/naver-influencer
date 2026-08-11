import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function CompetitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 로그인 필수
  if (!authUser) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
