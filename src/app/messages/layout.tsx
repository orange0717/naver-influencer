import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 로그인 필수 — 목적지를 붙이지 않으면 로그인 후 홈에 남는다(keywords/layout.tsx 주석 참고).
  // 회원 전용 모달(가입/로그인 둘 다)로 통일(2026-08-28 오렌지 승인 "C를 B로 합치기").
  if (!authUser) {
    redirect(`/?memberOnly=1&redirect=${encodeURIComponent('/messages')}`);
  }

  return <>{children}</>;
}
