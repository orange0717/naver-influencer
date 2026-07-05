'use client';

import { Suspense, useEffect } from 'react';
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

  useEffect(() => {
    const authModal = searchParams.get('authModal');
    if (authModal !== 'login' && authModal !== 'signup') return;

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
    // 최초 진입 시 1회만 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function AuthModalQueryHandler() {
  return (
    <Suspense fallback={null}>
      <Handler />
    </Suspense>
  );
}
