import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { isTrialExpired } from '@/lib/trial';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '키워드 분석 — 네이버 블로그 SEO 키워드 도구',
  description: '네이버 인플루언서 키워드챌린지 참여자수·검색량·경쟁도·TOP3 점유율을 한눈에 분석. 블루오션 키워드를 빠르게 찾으세요.',
  keywords: ['네이버 키워드 분석', '블로그 SEO', '키워드 경쟁도', '검색량 조회', '키워드챌린지', '블루오션 키워드'],
  alternates: { canonical: 'https://ninfle.kr/keywords' },
  openGraph: {
    title: '키워드 분석 — N인플',
    description: '참여자수·검색량·경쟁도 기반 블루오션 키워드 찾기',
    url: 'https://ninfle.kr/keywords',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '키워드 분석 — N인플',
    description: '참여자수·검색량·경쟁도 기반 블루오션 키워드 찾기',
  },
};

export default async function KeywordsLayout({
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

  // 데모 세션 만료 시 결제 페이지로 — 쿠키 만료 시각이 변조됐을 때 안전장치
  if (isDemo && isTrialExpired(cookieStore.get('trial_started')?.value)) {
    redirect('/subscribe');
  }

  // 무료플랜 포함 모든 페이지는 회원가입/로그인(또는 데모 세션) 필수
  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  return <>{children}</>;
}
