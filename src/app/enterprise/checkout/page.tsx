import { Suspense } from 'react';
import type { Metadata } from 'next';
import CheckoutClient from './CheckoutClient';

export const metadata: Metadata = {
  title: '기업용 결제 | N인플',
  description: '기업 계정 좌석 결제를 진행합니다.',
  robots: { index: false, follow: false },
};

export default function EnterpriseCheckoutPage() {
  return (
    <Suspense
      fallback={<div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>}
    >
      <CheckoutClient />
    </Suspense>
  );
}
