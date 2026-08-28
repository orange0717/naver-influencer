import type { Metadata } from 'next';
import ManageClient from './ManageClient';

export const metadata: Metadata = {
  title: '기업 계정 관리 | N인플',
  description: '기업 계정의 구독 현황과 멤버를 관리합니다.',
  robots: { index: false, follow: false },
};

export default function EnterpriseManagePage() {
  return <ManageClient />;
}
