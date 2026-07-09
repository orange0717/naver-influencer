import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '성장 후기 작성',
  description: 'N인플을 이용하며 겪은 성장 경험을 다른 인플루언서·블로거들과 공유해보세요.',
  robots: { index: false, follow: true },
};

export default function StoriesWriteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
