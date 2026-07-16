'use client';

import { useEffect, useState } from 'react';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { useAuthModal } from '@/contexts/AuthModalContext';
import DemoModal from './DemoModal';

export default function MemberOnlyModal() {
  const { open, redirectTo, close } = useMemberOnlyGate();
  const { openLogin } = useAuthModal();
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  function startDemo() {
    close();
    setShowDemo(true);
  }

  function goLogin() {
    close();
    openLogin({ redirectTo: redirectTo || undefined });
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,.45)' }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-only-title"
        >
          <div
            className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-[480px] sm:w-[90%] p-8"
            onClick={(e) => e.stopPropagation()}
          >
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
              🔒 회원 전용 서비스입니다.
            </h2>
            <p className="text-sm text-dim text-center mb-8 leading-relaxed">
              현재 선택하신 기능은<br />
              회원가입 후 이용할 수 있습니다.
              <br /><br />
              먼저 데모를 체험해보시겠습니까?
              <br />
              데모에서는 실제 기능을<br />
              미리 체험해볼 수 있습니다.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={startDemo}
                className="w-full px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition"
              >
                무료 데모 체험하기
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
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      <DemoModal open={showDemo} onClose={() => setShowDemo(false)} />
    </>
  );
}
