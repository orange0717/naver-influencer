import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext, isRestricted } from '@/lib/admin';
import ClaudeChatClient from './ClaudeChatClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '블로그 글 피드백(클로드 AI) — N인플',
  description: 'Claude와 채팅하며 블로그 글의 방향과 흐름에 대한 가벼운 피드백 받기',
};

// Claude AI 호출 비용 발생 기능 — 데모 체험 제외, 가입 회원 전용
export default async function ClaudeFeaturePage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/claude');

  const ctx = await getPaywallContext(authUser.id, authUser.email);
  if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
    if (await isRestricted(authUser.email)) redirect('/subscribe');
  }

  return <ClaudeChatClient />;
}
