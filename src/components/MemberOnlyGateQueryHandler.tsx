'use client';

import { Suspense, useEffect, useRef } from 'react';
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
  // 같은 쿼리를 두 번 열지 않기 위한 표시. deps 를 [] 로 막는 대신 이걸로 막는다(아래 설명).
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (searchParams.get('memberOnly') !== '1') return;

    // 이미 처리한 쿼리면 다시 열지 않는다. 아래 router.replace 가 쿼리를 지우므로
    // 보통은 위 early return 에 먼저 걸리지만, 지우기 전에 리렌더가 한 번 더 돌 수 있다.
    const key = searchParams.toString();
    if (handled.current === key) return;
    handled.current = key;

    const redirectTo = sanitizeRedirect(searchParams.get('redirect'));
    openGate(redirectTo);

    const params = new URLSearchParams(searchParams);
    params.delete('memberOnly');
    params.delete('redirect');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // ⚠️ 예전엔 deps 가 [] 였다("최초 진입 시 1회만 처리"). AuthModalQueryHandler 와 똑같은 버그다.
    // **이미 홈에 있는 상태에서** 쿼리만 바뀌면 레이아웃이 그대로 마운트돼 있어서 이 effect 가
    // 다시 돌지 않는다 → 회원 전용 모달이 아예 안 뜬다. 소프트 내비게이션에서 서버 레이아웃이
    // /?memberOnly=1&redirect=... 로 돌려보내는 경로(keywords/layout.tsx 등)가 여기에 해당한다.
    // 재실행은 위 handled ref 로 막으므로 중복으로 열리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export default function MemberOnlyGateQueryHandler() {
  return (
    <Suspense fallback={null}>
      <Handler />
    </Suspense>
  );
}
