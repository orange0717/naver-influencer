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

  if (!authUser) redirect('/auth/login?redirect=/dashboard/writing/spellcheck');

  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <SpellcheckClient />;
}
