'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { isDesktop } from '@/lib/desktop';
import Modal from '@/components/ui/Modal';

const STORAGE_KEY = 'ninfle_first_visit_dismissed';

const SKIP_PATHS = ['/auth', '/intro'];

function FirstVisitModalInner() {
  const { user, isLoading } = useAuth();
  const { openSignup } = useAuthModal();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (user.id) return;
    if (typeof window === 'undefined') return;
    // 데스크탑 앱 사용자는 이미 앱을 설치한 상태이므로 처음 방문 안내 불필요
    if (isDesktop()) return;
    if (SKIP_PATHS.some(p => pathname?.startsWith(p))) return;
    // 회원 전용 모달(memberOnly 쿼리)이 이미 같은 목적의 안내를 띄우므로 중복 방지
    if (searchParams.get('memberOnly') === '1') return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      return;
    }
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isLoading, pathname]);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // localStorage 차단 환경에서는 세션 동안만 비노출
    }
    setOpen(false);
  }

  function signup() {
    dismiss();
    openSignup();
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      role="dialog"
      ariaModal
      ariaLabelledBy="first-visit-title"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-md p-8">
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded-full">
              처음 방문
            </span>
          </div>
          <h2 id="first-visit-title" className="text-lg font-bold text-text text-center mb-2">
            N인플에 처음 방문하셨습니까?
          </h2>
          <p className="text-sm text-dim text-center mb-3 leading-relaxed">
            <span className="text-accent font-semibold">회원가입 없이 하루 5회 무료</span>로<br />
            바로 체험해보실 수 있습니다.
          </p>
          <p className="text-[11px] text-dim/80 text-center mb-8 leading-relaxed">
            회원가입하면 매일 더 많은 무료 이용량이 제공됩니다.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-semibold text-dim hover:bg-surface transition"
            >
              둘러보기
            </button>
            <button
              type="button"
              onClick={signup}
              className="flex-1 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition"
            >
              회원가입
            </button>
          </div>
      </div>
    </Modal>
  );
}

export default function FirstVisitModal() {
  return (
    <Suspense fallback={null}>
      <FirstVisitModalInner />
    </Suspense>
  );
}
