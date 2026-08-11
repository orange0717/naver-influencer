'use client';

import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { useAuthModal } from '@/contexts/AuthModalContext';
import Modal from '@/components/ui/Modal';

export default function MemberOnlyModal() {
  const { open, redirectTo, close } = useMemberOnlyGate();
  const { openLogin, openSignup } = useAuthModal();

  function goSignup() {
    close();
    openSignup({ redirectTo: redirectTo || undefined });
  }

  function goLogin() {
    close();
    openLogin({ redirectTo: redirectTo || undefined });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnEscape
      lockBodyScroll
      role="dialog"
      ariaModal
      ariaLabelledBy="member-only-title"
      overlayClassName="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/45"
    >
      <div className="relative bg-bg rounded-lg border border-border shadow-xl w-full max-w-[480px] sm:w-[90%] p-8">
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

          <h2 id="member-only-title" className="text-lg font-bold text-text text-center mb-3">
            🔒 N인플은 회원 전용 서비스입니다.
          </h2>
          <p className="text-sm text-dim text-center mb-4 leading-relaxed">
            이 기능은 회원만 이용할 수 있습니다.
            <br /><br />
            비회원도 하루 3회는 로그인 없이 체험할 수 있습니다.<br />
            더 많이 이용하시려면 회원가입 후 이용권을 구매해보세요.
            <br /><br />
            블로그 분석, 인플루언서 분석,<br />
            AI 브리핑, 키워드 챌린지,<br />
            토픽 발행 등 모든 기능을 이용해보세요.
          </p>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={goSignup}
              className="w-full px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition"
            >
              회원가입
            </button>
            <button
              type="button"
              onClick={goLogin}
              className="w-full px-4 py-3 rounded-xl border border-border text-sm font-semibold text-text hover:bg-surface transition"
            >
              로그인
            </button>
            <button
              type="button"
              onClick={close}
              className="w-full px-4 py-2 text-xs font-semibold text-dim hover:text-text transition"
            >
              나중에 보기
            </button>
          </div>
      </div>
    </Modal>
  );
}
