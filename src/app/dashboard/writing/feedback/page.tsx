import { redirect } from 'next/navigation';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { isRestricted, isAdmin } from '@/lib/admin';
import FeedbackClient from './FeedbackClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI 심층 피드백 — N인플',
  description: 'Claude Opus 기반 4영역 품질 평가와 강점·개선점 분석',
};

export default async function FeedbackPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/writing/feedback');
  if (await isRestricted(authUser.email)) redirect('/subscribe');

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, subscription_plan, subscription_expires_at')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  const plan = profile?.subscription_plan;
  const expires = profile?.subscription_expires_at ? new Date(profile.subscription_expires_at).getTime() : 0;
  const isInfluencer = plan === 'INFLUENCER' && expires > Date.now();
  const adminBypass = profile?.id ? isAdmin(profile.id) : false;

  if (!isInfluencer && !adminBypass) redirect('/subscribe?highlight=influencer');

  return <FeedbackClient />;
}
