import type { Metadata } from 'next';
import DecoderClient from './DecoderClient';

export const metadata: Metadata = {
  title: '네이버 URL 디코더 · 블로그 통계 referer 분석 (무료) | N인플',
  description:
    '네이버 블로그 통계의 알 수 없는 referer URL을 붙여넣으면 어떤 검색에서, 어떤 방식(검색기록·자동완성·직접입력)으로 들어왔는지 한 줄로 해석합니다. sm 코드 · trackingCode · topReferer 자동 디코딩, 일괄 분석 리포트 지원, 무료.',
  keywords: [
    '네이버 URL 디코더',
    '블로그 referer 분석',
    'topReferer 해석',
    'sm 코드',
    'top_hty',
    'top_sug',
    'trackingCode',
    '블로그 통계',
    '네이버 검색 유입',
    'N인플',
  ],
  alternates: { canonical: 'https://ninfle.kr/decoder' },
  openGraph: {
    title: '네이버 URL 디코더 (무료)',
    description:
      '블로그 통계의 referer URL을 한 줄 해석. sm 코드 · trackingCode · topReferer 자동 파싱, 일괄 분석 리포트 무료 제공.',
    type: 'website',
    url: 'https://ninfle.kr/decoder',
    siteName: 'N인플',
  },
  twitter: {
    card: 'summary_large_image',
    title: '네이버 URL 디코더 (무료)',
    description: '블로그 통계의 referer URL을 한 줄 해석. 무료 도구.',
  },
};

export default async function DecoderPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>;
}) {
  const sp = await searchParams;
  const initialUrl = Array.isArray(sp.url) ? sp.url[0] : sp.url || '';
  return <DecoderClient initialUrl={initialUrl} />;
}
