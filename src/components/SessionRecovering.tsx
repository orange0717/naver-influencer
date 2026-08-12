'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * SessionRecovering
 *
 * 로그인 쿠키(sb-*-auth-token)는 존재하지만 서버에서 Supabase Auth 응답이
 * 지연(getUserWithTimeout 타임아웃)되어 사용자 판정에 실패했을 때 렌더한다.
 *
 * 이 경우 "가입하세요" 게스트 빈 화면을 보여주면 로그인한 사용자가 자신의
 * 데이터가 사라진 것으로 오인한다(특히 새 PC/느린 네트워크에서 첫 진입 시).
 * 대신 "세션 확인 중" 로딩 상태를 노출하고 자동으로 재시도(router.refresh)한다.
 */
export default function SessionRecovering({
  message = '로그인 세션을 확인하는 중입니다…',
}: {
  message?: string;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // 최대 3회 자동 재시도 (1.2s → 2.4s → 3.6s). 그 사이 Auth 서버가 회복되면
    // 서버 컴포넌트가 정상적으로 사용자 데이터를 렌더한다.
    if (attempt >= 3) return;
    const t = setTimeout(() => {
      setAttempt((n) => n + 1);
      router.refresh();
    }, 1200 * (attempt + 1));
    return () => clearTimeout(t);
  }, [attempt, router]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div
        className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden
      />
      <h1 className="font-title text-lg font-bold text-text mb-2">내 대시보드</h1>
      <p className="text-sm text-dim leading-relaxed">{message}</p>
      {attempt >= 3 && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-6 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
        >
          새로고침
        </button>
      )}
    </div>
  );
}
