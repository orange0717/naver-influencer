import type { Metadata } from 'next';
import Client from './Client';

const url = 'https://ninfle.kr/keywords/blogger';
const title = '블로거 키워드 검색량 조회';
const description = '네이버 검색광고 API 기준 블로그 키워드의 PC·모바일 월간 검색량을 무료로 분석하세요.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: {
    title: `${title} — N인플`,
    description,
    url,
    siteName: 'N인플',
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} — N인플`,
    description,
  },
};

export default function Page() {
  return <Client />;
}
