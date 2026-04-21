import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = {
  title: '인플루언서 상세 | N인플',
  description: '네이버 인플루언서의 키워드 포트폴리오·팬 수·통합 TOP3 실적을 분석합니다.',
  openGraph: {
    title: '인플루언서 상세 | N인플',
    description: '네이버 인플루언서 키워드 포트폴리오 분석',
    type: 'profile',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary',
    title: '인플루언서 상세 | N인플',
    description: '네이버 인플루언서 키워드 포트폴리오 분석',
  },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Client params={params} />;
}
