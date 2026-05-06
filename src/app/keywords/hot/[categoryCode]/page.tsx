import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import CategoryKeywordsClient from './CategoryKeywordsClient';

export const dynamic = 'force-dynamic';

export default async function CategoryKeywordsPage({
  params,
}: {
  params: Promise<{ categoryCode: string }>;
}) {
  const { categoryCode } = await params;

  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect(`/auth/login?redirect=/keywords/hot/${categoryCode}`);

  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <CategoryKeywordsClient categoryCode={categoryCode} />;
}
