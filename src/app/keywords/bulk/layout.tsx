import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout, createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function BulkKeywordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) {
    redirect('/auth/login');
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('subscription_plan, subscription_expires_at, is_admin')
    .eq('auth_id', authUser.id)
    .single();

  const isAdmin = data?.is_admin === true;
  const expires = data?.subscription_expires_at;
  const isInfluencer =
    data?.subscription_plan === 'INFLUENCER' &&
    !!expires &&
    new Date(expires).getTime() > Date.now();

  if (!isAdmin && !isInfluencer) {
    redirect('/subscribe?required=influencer');
  }

  return <>{children}</>;
}
