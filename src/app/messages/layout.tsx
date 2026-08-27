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
  if (!authUser) {
    redirect(`/auth/login?redirect=${encodeURIComponent('/messages')}`);
  }

  return <>{children}</>;
}
