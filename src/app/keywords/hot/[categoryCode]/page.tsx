import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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

  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true' && !!cookieStore.get('naver_id')?.value;

  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser && !isDemo) redirect(`/auth/login?redirect=/keywords/hot/${categoryCode}`);

  if (authUser) {
    const ctx = await getPaywallContext(authUser.id, authUser.email);
    const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
    if (!allowed) redirect('/subscribe?highlight=blogger');
  }

  return <CategoryKeywordsClient categoryCode={categoryCode} />;
}
