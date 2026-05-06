import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import TrendingTopicsClient from './TrendingTopicsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '실시간 상승 키워드 — N인플',
  description: '네이버 인플루언서 키워드챌린지 주제별 급상승 키워드 모니터링',
};

export default async function TrendingTopicsPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/keywords/hot');

  // 관리자 또는 활성 유료 구독자(BLOGGER/INFLUENCER)면 무조건 통과
  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <TrendingTopicsClient />;
}
