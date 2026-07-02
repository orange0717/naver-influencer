import type { Metadata } from 'next';
import { requireLoginPage } from '@/lib/plan-server-guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '인플루언서 명단 — 무료 열람',
  description: '네이버 인플루언서 명단을 무료로 검색·열람하세요. 이름, 프로필, 팬수, 활동 분야, 선정일을 확인할 수 있습니다.',
  keywords: ['네이버 인플루언서', '인플루언서 명단', '인플루언서 리스트', '파워블로거'],
  alternates: { canonical: 'https://ninfle.kr/influencers/list' },
  openGraph: {
    title: '인플루언서 명단 — N인플',
    description: '네이버 인플루언서 명단 무료 열람',
    url: 'https://ninfle.kr/influencers/list',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '인플루언서 명단 — N인플',
    description: '네이버 인플루언서 명단 무료 열람',
  },
};

export default async function InfluencersListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로그인 회원 누구나 무료 열람 가능 — 구독 플랜 무관 (키챌 데이터는 미포함)
  await requireLoginPage('/influencers/list');

  return <>{children}</>;
}
