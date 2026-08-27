import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function CompetitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 로그인 필수 — 목적지를 붙이지 않으면 로그인 후 홈에 남는다(keywords/layout.tsx 주석 참고).
  // /competitor 는 MEMBER_ONLY_GATE_PREFIXES(middleware.ts:105)라 하드 내비게이션과 같은
  // 회원 전용 모달로 맞춘다.
  if (!authUser) {
    redirect(`/?memberOnly=1&redirect=${encodeURIComponent('/competitor')}`);
  }

  return <>{children}</>;
}
