import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = {
  title: '키워드 상세 | N인플',
  description: '네이버 키워드의 월 검색량·경쟁도·참여 인플루언서 순위를 한 페이지에서 확인하세요.',
  openGraph: {
    title: '키워드 상세 | N인플',
    description: '네이버 키워드 순위와 경쟁도 분석',
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary',
    title: '키워드 상세 | N인플',
    description: '네이버 키워드 순위와 경쟁도 분석',
  },
};

export default function Page() {
  return <Client />;
}
