'use client';

import { useRouter } from 'next/navigation';
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';
import Modal from '@/components/ui/Modal';

const FEATURE_LINES = (
  <>
    블로그 분석, 인플루언서 분석, 키워드 챌린지,<br />
    AI 브리핑, 토픽 발행, 랭킹 분석, 실시간 데이터
  </>
);

/**
 * PRO 전용 페이지 게이트 모달 — "PRO 이용권이 필요합니다" 안내 + 구매 유도.
 * 2026-08-08 프리미엄 모델 전환: 7일 자가발급 체험 폐지에 따라 offer/ended 두 분기를 없애고
 * 단일 안내로 통합. 가벼운 기능은 이 모달 대신 하루 5회 무료 풀(free-quota.ts)로 체험 가능하다.
 */
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
      ariaLabelledBy="pro-required-title"
      overlayClassName="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/45"
    >
      <div className="relative bg-bg rounded-lg border border-border shadow-lg w-full max-w-[480px] sm:w-[90%] p-8">
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

        <h2 id="pro-required-title" className="text-lg font-bold text-text text-center mb-3">
          PRO 이용권이 필요합니다
        </h2>
        <p className="text-sm text-dim text-center mb-4 leading-relaxed">
          이 기능은 대량 데이터·AI 분석이 필요해 PRO 이용권 전용입니다.
          <br /><br />
          이용권을 구매하시면 N인플의 모든 기능을 계속 이용하실 수 있습니다.
          <br /><br />
          {FEATURE_LINES}
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
        </div>
      </div>
    </Modal>
  );
}
