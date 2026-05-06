import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import BlogRankingClient from './BlogRankingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '키워드 검색순위 — N인플',
  description: '특정 키워드의 상위 블로그·인플루언서 노출 순위 분석',
};

export default async function BlogRankingPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/keywords/blog-ranking');

  // 관리자 또는 활성 유료 구독자(BLOGGER/INFLUENCER)면 무조건 통과
  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <BlogRankingClient />;
}
