import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import YoutubeSttClient from './YoutubeSttClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '유튜브 음원 텍스트 추출 — N인플',
  description:
    '유튜브 영상의 자막을 추출하거나, 자막이 없으면 음원을 STT로 변환해 텍스트로 받아봅니다.',
};

export default async function YoutubeSttPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 회원 전용 모달(가입/로그인 둘 다)로 통일(2026-08-28 오렌지 승인 "C를 B로 합치기").
  if (!authUser) redirect(`/?memberOnly=1&redirect=${encodeURIComponent('/dashboard/youtube-stt')}`);

  const ctx = await getPaywallContext(authUser.id, authUser.email);
  const allowed = ctx.isAdminUser || ctx.hasActivePaidPlan;
  if (!allowed) redirect('/subscribe?highlight=blogger');

  return <YoutubeSttClient />;
}
