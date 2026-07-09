import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '마이페이지',
  description: 'N인플 계정 정보, 연결된 블로그·인플루언서홈, 알림 설정 등을 관리할 수 있는 마이페이지입니다.',
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
