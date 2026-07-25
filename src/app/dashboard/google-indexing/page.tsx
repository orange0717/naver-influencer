import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import GoogleIndexingSection from '@/components/dashboard/google-indexing/GoogleIndexingSection';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '구글 색인등록 — N인플',
  description: '네이버 블로그를 Google 검색에 등록 요청하고 색인 상태를 자동으로 추적합니다.',
};

export default async function GoogleIndexingPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) redirect('/auth/login?redirect=/dashboard/google-indexing');

  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <GoogleIndexingSection />
    </div>
  );
}
