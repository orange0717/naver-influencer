'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DemoModal from './DemoModal';

const STORAGE_KEY = 'ninfle_first_visit_dismissed';

// funnel/auth 페이지엔 자체 데모 진입점이 있으므로 모달 중복 방지
const SKIP_PATHS = ['/auth', '/trial', '/intro'];

export default function FirstVisitModal() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (user.id || user.isDemo) return;
    if (typeof window === 'undefined') return;
    if (SKIP_PATHS.some(p => pathname?.startsWith(p))) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      return;
    }
    setOpen(true);
  }, [user.id, user.isDemo, isLoading, pathname]);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // localStorage 차단 환경에서는 세션 동안만 비노출
    }
    setOpen(false);
  }

  function startDemo() {
    dismiss();
    setShowDemo(true);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-labelledby="first-visit-title"
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-md p-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded-full">
                처음 방문
              </span>
            </div>
            <h2 id="first-visit-title" className="text-lg font-bold text-text text-center mb-2">
              N인플에 처음 방문하셨습니까?
            </h2>
            <p className="text-sm text-dim text-center mb-3 leading-relaxed">
              회원가입 없이 인플루언서홈 또는 블로그 주소만 입력하면<br />
              <span className="text-accent font-semibold">3일간 핵심 기능을 무료</span>로 체험할 수 있습니다.
            </p>
            <p className="text-[11px] text-dim/80 text-center mb-8 leading-relaxed">
              ※ Claude AI 기능(맞춤법 검사·블로그 글 피드백)은 가입 후 이용 가능
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-semibold text-dim hover:bg-surface transition"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={startDemo}
                className="flex-1 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition"
              >
                3일 무료체험
              </button>
            </div>
          </div>
        </div>
      )}
      <DemoModal open={showDemo} onClose={() => setShowDemo(false)} />
    </>
  );
}
