'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
 *
 * ⚠️ 재시도가 끝나면 반드시 빠져나갈 길을 준다(2026-08-27).
 *   예전에는 3회 실패 후에도 문구가 계속 "확인하는 중입니다…" 였고 버튼은 같은 렌더를
 *   다시 돌리는 새로고침뿐이라, 세션이 실제로 끊긴 사용자는 로그인 안내조차 못 받고
 *   이 화면에 영원히 갇혔다. 확인에 실패했으면 실패했다고 말하고 로그인·홈 경로를 준다.
 */
const MAX_ATTEMPTS = 3;

export default function SessionRecovering({
  message = '로그인 세션을 확인하는 중입니다…',
}: {
  message?: string;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  const gaveUp = attempt >= MAX_ATTEMPTS;

  useEffect(() => {
    // 최대 3회 자동 재시도 (1.2s → 2.4s → 3.6s). 그 사이 Auth 서버가 회복되면
    // 서버 컴포넌트가 정상적으로 사용자 데이터를 렌더한다.
    if (gaveUp) return;
    const t = setTimeout(() => {
      setAttempt((n) => n + 1);
      router.refresh();
    }, 1200 * (attempt + 1));
    return () => clearTimeout(t);
  }, [attempt, gaveUp, router]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      {!gaveUp && (
        <div
          className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
          aria-hidden
        />
      )}
      <h1 className="type-page-title text-text mb-2">내 대시보드</h1>

      {!gaveUp ? (
        <p className="text-sm text-dim leading-relaxed" aria-live="polite">
          {message}
        </p>
      ) : (
        <>
          {/*
            여기서 "데이터가 없습니다"라고 말하면 안 된다 — 확인에 실패한 것이지
            비어 있는 게 아니다. 사용자가 다음에 무엇을 할지 알 수 있게만 쓴다.
          */}
          <p className="text-sm text-dim leading-relaxed" aria-live="polite">
            로그인 상태를 확인하지 못했습니다.
            <br />
            데이터가 사라진 것이 아니라, 로그인 세션이 만료되었거나 일시적으로 확인이 안 되는
            상태입니다. 다시 로그인하면 그대로 이어서 보실 수 있습니다.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/auth/login?redirect=%2Fmy"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
            >
              다시 로그인
            </Link>
            <button
              type="button"
              onClick={() => setAttempt(0)}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-border bg-surface text-text font-semibold text-sm hover:border-accent/40 transition-colors cursor-pointer"
            >
              다시 시도
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-border bg-surface text-dim font-semibold text-sm hover:border-accent/40 transition-colors"
            >
              홈으로
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
