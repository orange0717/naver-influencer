import type { Metadata } from 'next';
import EnterpriseClient from './EnterpriseClient';

export const metadata: Metadata = {
  title: '기업용 문의 — N인플',
  description:
    '기업·기관·대행사를 위한 N인플 기업용 문의. 사용 인원, 관리 대상, 필요한 기능에 맞춰 이용 환경을 상담해드립니다.',
  alternates: { canonical: 'https://ninfle.kr/enterprise' },
  openGraph: {
    title: '기업용 문의 — N인플',
    description: '기업의 마케팅 데이터를 더 체계적으로 분석하고 관리할 수 있도록 상담해드립니다.',
    url: 'https://ninfle.kr/enterprise',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
};

export default function EnterprisePage() {
  return <EnterpriseClient />;
}
