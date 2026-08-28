import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '커뮤니티 — 네이버 인플루언서·블로거 토론장',
  description: '네이버 인플루언서·블로거 커뮤니티. 키워드 정보 공유, 검색량 변화 토론, 챌린지 전략, 비회원도 익명 투표 가능.',
  keywords: ['네이버 인플루언서 커뮤니티', '블로거 커뮤니티', '키워드챌린지 전략', '블로그 운영 팁'],
  alternates: { canonical: 'https://ninfle.kr/community' },
  openGraph: {
    title: '커뮤니티 — N인플',
    description: '네이버 인플루언서·블로거 토론장',
    url: 'https://ninfle.kr/community',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '커뮤니티 — N인플',
    description: '네이버 인플루언서·블로거 토론장',
  },
};

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 비로그인 차단 — 목적지를 붙이지 않으면 로그인 후 홈에 남는다(keywords/layout.tsx 주석 참고).
  // 회원 전용 모달(가입/로그인 둘 다 제시)로 통일한다. 로그인 폼만 띄우면 계정이 없는
  // 첫 방문자에게 막다른 길이 된다(2026-08-28 오렌지 승인 "C를 B로 합치기").
  if (!authUser) {
    redirect(`/?memberOnly=1&redirect=${encodeURIComponent('/community')}`);
  }

  // 커뮤니티 = 예비 인플루언서+ 플랜 전용 (관리자 우회 허용)
  const ctx = await getPaywallContext(authUser.id, authUser.email);
  if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
    redirect('/subscribe?highlight=blogger');
  }

  return <>{children}</>;
}
