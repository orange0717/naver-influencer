'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';
import Modal from '@/components/ui/Modal';

const FEATURE_LINES = (
  <>
    블로그 분석, 인플루언서 분석, 키워드 챌린지,<br />
    AI 브리핑, 토픽 발행, 랭킹 분석, 실시간 데이터
  </>
);

export default function TrialEndedModal() {
  const { open, close, reason, redirectTo } = useTrialEndedGate();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goSubscribe() {
    close();
    router.push('/subscribe');
  }

  async function startTrial() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch('/api/trial/start', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '체험 시작에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      close();
      router.push(redirectTo ?? '/my');
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setStarting(false);
    }
  }

  const isOffer = reason === 'offer';
  const titleId = isOffer ? 'trial-offer-title' : 'trial-ended-title';

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnEscape
      lockBodyScroll
      role="dialog"
      ariaModal
      ariaLabelledBy={titleId}
      overlayClassName="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/45"
    >
      <div className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-[480px] sm:w-[90%] p-8">
        <button
          type="button"
          onClick={close}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-dim transition hover:bg-surface hover:text-text"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l10 10M14 4L4 14" />
          </svg>
        </button>

        {isOffer ? (
          <>
            <h2 id={titleId} className="text-lg font-bold text-text text-center mb-3">
              7일 무료체험을 시작해보세요
            </h2>
            <p className="text-sm text-dim text-center mb-4 leading-relaxed">
              지금 시작하시면 N인플의 모든 기능을 7일간 무료로 체험하실 수 있습니다.
              <br /><br />
              {FEATURE_LINES}
            </p>
            <p className="text-xs text-accent font-semibold text-center mb-6 leading-relaxed">
              🚀 지금 시작하고 N인플의 모든 프리미엄 기능을<br />
              7일간 무료로 이용해보세요!
            </p>
            {error && (
              <p className="text-xs text-down text-center mb-4">{error}</p>
            )}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={startTrial}
                disabled={starting}
                className="w-full px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition disabled:opacity-50"
              >
                {starting ? '시작하는 중…' : '무료체험 시작하기'}
              </button>
              <button
                type="button"
                onClick={goSubscribe}
                className="w-full px-4 py-3 rounded-xl border border-border text-sm font-semibold text-text hover:bg-surface transition"
              >
                이용권 구매하기
              </button>
              <button
                type="button"
                onClick={close}
                className="w-full px-4 py-2 text-xs font-semibold text-dim hover:text-text transition"
              >
                나중에 하기
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="text-lg font-bold text-text text-center mb-3">
              7일 무료체험이 종료되었습니다
            </h2>
            <p className="text-sm text-dim text-center mb-4 leading-relaxed">
              무료체험 기간이 끝나 더 이상 이용하실 수 없습니다.
              <br /><br />
              지금 이용권을 구매하시면 N인플의 모든 기능을 계속 이용하실 수 있습니다.
              <br /><br />
              {FEATURE_LINES}
            </p>
            <p className="text-xs text-accent font-semibold text-center mb-8 leading-relaxed">
              🚀 지금 이용권을 구매하고 N인플의 모든 프리미엄 기능을<br />
              계속 이용해보세요!
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={goSubscribe}
                className="w-full px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition"
              >
                이용권 구매하기
              </button>
              <button
                type="button"
                onClick={close}
                className="w-full px-4 py-3 rounded-xl border border-border text-sm font-semibold text-text hover:bg-surface transition"
              >
                나중에 하기
              </button>
              <button
                type="button"
                onClick={goSubscribe}
                className="w-full px-4 py-2 text-xs font-semibold text-dim hover:text-text transition"
              >
                이용권 보기
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
