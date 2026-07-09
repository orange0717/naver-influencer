import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '연도별 인플루언서 선정 현황 — 통계',
  description: '카테고리별·연도별 네이버 인플루언서 선정 인원 통계를 한눈에 확인할 수 있습니다.',
  alternates: { canonical: 'https://ninfle.kr/stats' },
  openGraph: {
    title: '연도별 인플루언서 선정 현황 — N인플',
    description: '카테고리별·연도별 네이버 인플루언서 선정 인원 통계',
    url: 'https://ninfle.kr/stats',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '연도별 인플루언서 선정 현황 — N인플',
    description: '카테고리별·연도별 네이버 인플루언서 선정 인원 통계',
  },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
