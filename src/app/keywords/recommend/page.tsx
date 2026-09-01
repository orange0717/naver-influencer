import type { Metadata } from 'next';
import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import Client from './Client';

const url = 'https://ninfle.kr/keywords/recommend';
const title = '키워드 추천';
const description = 'AI가 검색량·경쟁도·트렌드·블로그 발행량·AI브리핑 노출까지 분석해 지금 써야 하는 키워드를 추천합니다.';

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

export default async function Page() {
  const gate = await checkFeaturePage('keywords.recommend', '/keywords/recommend');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <Client />;
}
