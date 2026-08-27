'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthModal } from '@/contexts/AuthModalContext';

function sanitizeRedirect(raw: string | null): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/')) return undefined;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
  return raw;
}

/** ?authModal=login|signup 쿼리로 들어오면 모달을 자동으로 열고 쿼리를 정리한다. (구 /auth/login, /auth/signup 진입점 대응) */
function Handler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openLogin, openSignup } = useAuthModal();
  // 같은 쿼리를 두 번 열지 않기 위한 표시. deps 를 [] 로 막는 대신 이걸로 막는다(아래 설명).
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const authModal = searchParams.get('authModal');
    if (authModal !== 'login' && authModal !== 'signup') return;

    // 이미 처리한 쿼리면 다시 열지 않는다. 아래 router.replace 가 쿼리를 지우므로
    // 보통은 위 early return 에 먼저 걸리지만, 지우기 전에 리렌더가 한 번 더 돌 수 있다.
    const key = searchParams.toString();
    if (handled.current === key) return;
    handled.current = key;

    const redirectTo = sanitizeRedirect(searchParams.get('redirect'));
    const reason = searchParams.get('reason') ?? undefined;

    if (authModal === 'login') {
      openLogin({ redirectTo, reason });
    } else {
      openSignup({ redirectTo });
    }

    const params = new URLSearchParams(searchParams);
    params.delete('authModal');
    params.delete('redirect');
    params.delete('reason');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // ⚠️ 예전엔 deps 가 [] 였다("최초 진입 시 1회만 처리"). 그래서 **이미 홈에 있는 상태에서**
    // 쿼리만 바뀌는 경우엔 모달이 아예 안 떴다. 실제로 이런 일이 난다:
    // 홈에서 '키워드 순위' 칩을 누르면 미들웨어(middleware.ts:368)가 소프트 내비게이션을
    // /?authModal=login&redirect=... 로 되돌리는데, 레이아웃은 그대로 마운트돼 있으니
    // 이 effect 가 다시 돌지 않는다 → **눌렀는데 아무 일도 안 일어난다**(실측 확인).
    // middleware.ts:515 의 reason=session_taken 도 마찬가지라, 다른 기기에서 로그인돼
    // 튕긴 사람이 이유를 한 글자도 못 보고 홈에 서 있게 된다.
    // 재실행은 위 handled ref 로 막으므로 중복으로 열리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export default function AuthModalQueryHandler() {
  return (
    <Suspense fallback={null}>
      <Handler />
    </Suspense>
  );
}
