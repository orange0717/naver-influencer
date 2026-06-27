import type { Metadata } from 'next';
import { requireInfluencerPlusPage } from '@/lib/plan-server-guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '인플루언서 리스트 — 네이버 19,980명 데이터',
  description: '네이버 인플루언서 19,980명 목록 조회. 활동/미활동 자동 판정, 팬수, TOP3 실적, 선정일·카테고리 기반 정렬과 검색.',
  keywords: ['네이버 인플루언서', '인플루언서 리스트', '파워블로거', '인플루언서 순위', '키워드챌린지'],
  alternates: { canonical: 'https://ninfle.kr/influencers' },
  openGraph: {
    title: '인플루언서 리스트 — N인플',
    description: '네이버 19,980명 인플루언서 데이터 조회',
    url: 'https://ninfle.kr/influencers',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '인플루언서 리스트 — N인플',
    description: '네이버 19,980명 인플루언서 데이터 조회',
  },
};

export default async function InfluencersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 인플루언서 구독자(또는 관리자)만 열람 가능 — 그 외엔 로그인/구독 페이지로 리다이렉트
  await requireInfluencerPlusPage('/influencers');

  return <>{children}</>;
}
