'use client';

import { useRouter } from 'next/navigation';
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';
import Modal from '@/components/ui/Modal';

export default function TrialEndedModal() {
  const { open, close } = useTrialEndedGate();
  const router = useRouter();

  function goSubscribe() {
    close();
    router.push('/subscribe');
  }

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnEscape
      lockBodyScroll
      role="dialog"
      ariaModal
      ariaLabelledBy="trial-ended-title"
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

        <h2 id="trial-ended-title" className="text-lg font-bold text-text text-center mb-3">
          7일 무료체험이 종료되었습니다
        </h2>
        <p className="text-sm text-dim text-center mb-4 leading-relaxed">
          무료체험 기간이 끝나 더 이상 이용하실 수 없습니다.
          <br /><br />
          지금 이용권을 구매하시면 N인플의 모든 기능을 계속 이용하실 수 있습니다.
          <br /><br />
          블로그 분석, 인플루언서 분석, 키워드 챌린지,<br />
          AI 브리핑, 토픽 발행, 랭킹 분석, 실시간 데이터
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
      </div>
    </Modal>
  );
}
