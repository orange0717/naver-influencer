import type { Metadata } from 'next';
import { Suspense } from 'react';
import SubscribeClient from './SubscribeClient';

export const metadata: Metadata = {
  title: '이용권 - N인플',
  description: 'N인플 이용권 안내. 무료, 블로거, 인플루언서 플랜을 선택하세요.',
};

export default function SubscribePage() {
  return (
    <Suspense>
      <SubscribeClient />
    </Suspense>
  );
}
