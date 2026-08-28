import { Suspense } from 'react';
import type { Metadata } from 'next';
import InviteClient from './InviteClient';

export const metadata: Metadata = {
  title: '기업 초대 수락 | N인플',
  description: '기업 계정 초대를 수락하고 좌석을 배정받습니다.',
  robots: { index: false, follow: false },
};

export default function EnterpriseInvitePage() {
  return (
    <Suspense
      fallback={<div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>}
    >
      <InviteClient />
    </Suspense>
  );
}
