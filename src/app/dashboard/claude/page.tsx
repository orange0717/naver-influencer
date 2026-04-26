import { redirect } from 'next/navigation';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { isRestricted, isAdmin } from '@/lib/admin';
import ClaudeChatClient from './ClaudeChatClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '클로드기능 — N인플',
  description: 'Claude Sonnet 기반 블로그 글 방향·흐름 피드백 채팅',
};

export default async function ClaudeFeaturePage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/claude');
  if (await isRestricted(authUser.email)) redirect('/subscribe');

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, subscription_plan, subscription_expires_at')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  const plan = profile?.subscription_plan;
  const expires = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at).getTime()
    : 0;
  const isInfluencer = plan === 'INFLUENCER' && expires > Date.now();
  const adminBypass = profile?.id ? isAdmin(profile.id) : false;

  if (!isInfluencer && !adminBypass) redirect('/subscribe?highlight=influencer');

  return <ClaudeChatClient />;
}
