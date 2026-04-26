import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext, isRestricted } from '@/lib/admin';
import ClaudeChatClient from './ClaudeChatClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '블로그 글 피드백(클로드) — N인플',
  description: 'Claude와 채팅하며 블로그 글의 방향과 흐름에 대한 가벼운 피드백 받기',
};

export default async function ClaudeFeaturePage() {
  // 회원 가입 + 로그인 필수. (제한 사용자 차단)
  // 무료 체험 3회 게이팅은 API 라우트에서 처리하므로
  // 여기서는 INFLUENCER 강제 게이팅 X.
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/claude');

  // 관리자/활성 구독자는 무조건 통과. 그 외에만 제한 체크.
  const ctx = await getPaywallContext(authUser.id, authUser.email);
  if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
    if (await isRestricted(authUser.email)) redirect('/subscribe');
  }

  return <ClaudeChatClient />;
}
