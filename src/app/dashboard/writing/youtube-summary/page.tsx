import { redirect } from 'next/navigation';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { isRestricted, isAdmin } from '@/lib/admin';
import YoutubeSummaryClient from './YoutubeSummaryClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '유튜브 영상 정리 — N인플',
  description: '유튜브 영상의 자막을 블로그 작성용으로 깔끔하게 정리합니다. 출처는 자동 표기됩니다.',
};

export default async function YoutubeSummaryPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/writing/youtube-summary');
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
  const isPaid = (plan === 'BLOGGER' || plan === 'INFLUENCER') && expires > Date.now();
  const adminBypass = profile?.id ? isAdmin(profile.id) : false;

  if (!isPaid && !adminBypass) redirect('/subscribe?highlight=blogger');

  return <YoutubeSummaryClient />;
}
