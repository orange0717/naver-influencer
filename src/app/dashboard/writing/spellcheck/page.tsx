import { redirect } from 'next/navigation';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { isRestricted, isAdmin } from '@/lib/admin';
import SpellcheckClient from './SpellcheckClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '맞춤법 검사 — N인플',
  description: '국립국어원 기준 규칙 1,600+개 + Claude AI 하이브리드 맞춤법 검사',
};

export default async function SpellcheckPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/writing/spellcheck');
  if (await isRestricted(authUser.email)) redirect('/subscribe');

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, subscription_plan, subscription_expires_at')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  const plan = profile?.subscription_plan;
  const expires = profile?.subscription_expires_at ? new Date(profile.subscription_expires_at).getTime() : 0;
  const isPaid = (plan === 'BLOGGER' || plan === 'INFLUENCER') && expires > Date.now();
  const adminBypass = profile?.id ? isAdmin(profile.id) : false;

  if (!isPaid && !adminBypass) redirect('/subscribe?highlight=blogger');

  return <SpellcheckClient />;
}
