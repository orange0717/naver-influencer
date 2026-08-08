'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';

function sanitizeRedirect(raw: string | null): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/')) return undefined;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
  return raw;
}

/**
 * 미들웨어가 붙이는 ?needsPro=1&redirect=... 쿼리로 들어오면 "PRO 이용권 필요" 모달을 연다.
 * (2026-08-08 이전에는 trialEnded/trialOffer 두 종류였으나 단일 needsPro로 통합)
 */
function Handler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openGate } = useTrialEndedGate();

  useEffect(() => {
    if (searchParams.get('needsPro') !== '1') return;

    const redirectTo = sanitizeRedirect(searchParams.get('redirect'));
    openGate(redirectTo);

    // needsPro=1은 URL에 남겨둔다 — /subscribe의 안내 배너가 이 값을 읽어
    // 모달을 닫아도 안내 화면이 계속 보이도록 유지한다.
    // redirect는 위에서 컨텍스트로 이미 옮겨졌으니 URL에서는 제거한다.
    if (searchParams.get('redirect')) {
      const params = new URLSearchParams(searchParams);
      params.delete('redirect');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    // 최초 진입 시 1회만 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function TrialEndedGateQueryHandler() {
  return (
    <Suspense fallback={null}>
      <Handler />
    </Suspense>
  );
}
