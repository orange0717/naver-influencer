'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';

function sanitizeRedirect(raw: string | null): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/')) return undefined;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
  return raw;
}

/** 미들웨어가 붙이는 ?memberOnly=1&redirect=... 쿼리로 들어오면 회원 전용 모달을 자동으로 연다. */
function Handler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openGate } = useMemberOnlyGate();

  useEffect(() => {
    if (searchParams.get('memberOnly') !== '1') return;

    const redirectTo = sanitizeRedirect(searchParams.get('redirect'));
    openGate(redirectTo);

    const params = new URLSearchParams(searchParams);
    params.delete('memberOnly');
    params.delete('redirect');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // 최초 진입 시 1회만 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function MemberOnlyGateQueryHandler() {
  return (
    <Suspense fallback={null}>
      <Handler />
    </Suspense>
  );
}
