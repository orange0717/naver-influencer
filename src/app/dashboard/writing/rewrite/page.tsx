import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import RewriteClient from './RewriteClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '리라이팅 — N인플',
  description: '교정·교열·윤문 후 다른 표현으로 글을 새롭게 재작성',
};

export default async function RewritePage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-title text-xl font-bold text-text">리라이팅</h1>
        <p className="text-sm text-dim leading-relaxed">
          이 기능은 가입 회원 전용입니다. 로그인하면 이 페이지에서 바로 이용할 수 있습니다.
        </p>
        <a
          href="/auth/login?redirect=/dashboard/writing/rewrite"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
        >
          로그인
        </a>
      </div>
    );
  }

  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <RewriteClient />;
}
