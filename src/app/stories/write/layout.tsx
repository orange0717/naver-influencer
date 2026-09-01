import type { Metadata } from 'next';
import { requireLoginPage } from '@/lib/plan-server-guards';

export const metadata: Metadata = {
  title: '성장 후기 작성',
  description: 'N인플을 이용하며 겪은 성장 경험을 다른 인플루언서·블로거들과 공유해보세요.',
  robots: { index: false, follow: true },
};

// 제출 시점에만 막으면 비로그인이 후기를 다 쓰고 나서 작성 내용을 잃는다.
export default async function StoriesWriteLayout({ children }: { children: React.ReactNode }) {
  await requireLoginPage('/stories/write');
  return <>{children}</>;
}
