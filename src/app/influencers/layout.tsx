import type { Metadata } from 'next';
import { STAT_TEXT } from '@/lib/site-stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `리스트(유료) — 네이버 ${STAT_TEXT.influencers} 데이터`,
  description: `네이버 인플루언서 ${STAT_TEXT.influencers} 목록 조회. 활동/미활동 자동 판정, 팬수, TOP3 실적, 선정일·카테고리 기반 정렬과 검색.`,
  keywords: ['네이버 인플루언서', '인플루언서 리스트', '파워블로거', '인플루언서 순위', '키워드챌린지'],
  alternates: { canonical: 'https://ninfle.kr/influencers' },
  openGraph: {
    title: '리스트(유료) — N인플',
    description: `네이버 ${STAT_TEXT.influencers} 인플루언서 데이터 조회`,
    url: 'https://ninfle.kr/influencers',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '리스트(유료) — N인플',
    description: `네이버 ${STAT_TEXT.influencers} 인플루언서 데이터 조회`,
  },
};

export default function InfluencersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 실제 구독 여부 가드는 하위 라우트(page.tsx, [id]/page.tsx)에서 개별 처리
  // — /influencers/list(무료 명단)는 이 레이아웃을 공유하지만 다른 가드를 사용해야 하므로
  //   레이아웃 레벨에서는 더 이상 구독 체크를 하지 않는다.
  return <>{children}</>;
}
