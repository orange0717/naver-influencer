import type { Metadata } from 'next';
import SignupClient from './SignupClient';

export const metadata: Metadata = {
  title: '기업용 가입 | N인플',
  description: '기업 계정을 만들고 좌석 수만큼 팀원을 초대해 N인플을 함께 이용하세요.',
  robots: { index: false, follow: false },
};

export default function EnterpriseSignupPage() {
  return <SignupClient />;
}
