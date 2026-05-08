import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import TrendingTopicsClient from './TrendingTopicsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '실시간 상승 키워드 — N인플',
  description: '네이버 인플루언서 키워드챌린지 주제별 급상승 키워드 모니터링',
};

export default async function TrendingTopicsPage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true' && !!cookieStore.get('naver_id')?.value;

  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser && !isDemo) redirect('/auth/login?redirect=/keywords/hot');

  if (authUser) {
    const ctx = await getPaywallContext(authUser.id, authUser.email);
    const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
    if (!allowed) redirect('/subscribe?highlight=blogger');
  }

  return <TrendingTopicsClient />;
}
