'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function TrialBanner() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    // trial_started 쿠키 확인 (httpOnly가 아닌 경우)
    // 서버에서 전달받는 방식으로 대체
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.trialDaysLeft !== undefined && data.trialDaysLeft >= 0) {
          setDaysLeft(data.trialDaysLeft);
        }
      })
      .catch(() => {});
  }, []);

  if (daysLeft === null) return null;

  return (
    <div className="bg-gradient-to-r from-accent/10 to-accent/5 rounded-xl border border-accent/20 px-5 py-3 flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-accent/15 rounded-lg flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </div>
        <div>
          <p className="text-sm font-bold text-text">
            무료 체험 중 <span className="text-accent">{daysLeft}일 남음</span>
          </p>
          <p className="text-[11px] text-dim">회원가입하면 모든 기능을 계속 이용할 수 있습니다</p>
        </div>
      </div>
      <Link
        href="/auth/signup"
        className="px-4 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition shrink-0"
      >
        회원가입
      </Link>
    </div>
  );
}
