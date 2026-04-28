import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import FeedbackClient from './FeedbackClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI 심층 피드백 — N인플',
  description: 'Claude Haiku 4.5 기반 4영역 품질 평가와 강점·개선점 분석',
};

export default async function FeedbackPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/writing/feedback');

  // 관리자는 무조건 통과. 일반 회원은 활성 INFLUENCER 만 통과.
  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || (ctx.hasActivePaidPlan && ctx.plan === 'INFLUENCER');
  if (!allowed) redirect('/subscribe?highlight=influencer');

  return <FeedbackClient />;
}
