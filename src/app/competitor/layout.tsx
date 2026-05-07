import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function CompetitorLayout({
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

  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
