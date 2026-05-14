import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import SpellcheckClient from './SpellcheckClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '맞춤법 검사 — N인플',
  description: '국립국어원 기준 규칙 1,600+개 + Claude AI 하이브리드 맞춤법 검사',
};

// Claude AI 호출 비용 발생 기능 — 데모 체험 제외, 가입 회원 전용
export default async function SpellcheckPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-title text-xl font-bold text-text">맞춤법 검사</h1>
        <p className="text-sm text-dim leading-relaxed">
          이 기능은 가입 회원 전용입니다. 로그인하면 이 페이지에서 바로 이용할 수 있습니다.
        </p>
        <a
          href="/auth/login?redirect=/dashboard/writing/spellcheck"
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

  return <SpellcheckClient />;
}
