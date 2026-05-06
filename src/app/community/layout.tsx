import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';

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
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

  // 무료플랜 포함 모든 페이지는 회원가입/로그인(또는 데모 세션) 필수
  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
