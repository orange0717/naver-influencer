import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout, createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 목적지를 붙이지 않으면 로그인 후 홈에 남는다(keywords/layout.tsx 주석 참고).
  // 회원 전용 모달(가입/로그인 둘 다 제시)로 통일 — 로그인 폼만 띄우면 계정이 없는
  // 첫 방문자에게 막다른 길이 된다(2026-08-28 오렌지 승인 "C를 B로 합치기").
  if (!authUser) {
    redirect(`/?memberOnly=1&redirect=${encodeURIComponent('/rankings')}`);
  }

  // 관리자 우회
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('subscription_plan, subscription_expires_at, is_admin')
    .eq('auth_id', authUser.id)
    .single();

  const isAdmin = data?.is_admin === true;
  const expires = data?.subscription_expires_at;
  const isInfluencer =
    data?.subscription_plan === 'INFLUENCER' &&
    !!expires &&
    new Date(expires).getTime() > Date.now();

  if (!isAdmin && !isInfluencer) {
    redirect('/subscribe?required=influencer');
  }

  return <>{children}</>;
}
