import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import YoutubeSummaryClient from './YoutubeSummaryClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '유튜브 자막추출 — N인플',
  description: '유튜브 영상의 자막을 추출해 블로그 작성에 참고할 수 있도록 정리합니다. 출처는 자동 표기됩니다.',
};

export default async function YoutubeSummaryPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  if (!authUser) redirect('/auth/login?redirect=/dashboard/writing/youtube-summary');

  // 관리자 또는 활성 유료 구독자(BLOGGER/INFLUENCER)면 무조건 통과
  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <YoutubeSummaryClient />;
}
