'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TrialBannerProps {
  isDemo?: boolean;
}

export default function TrialBanner({ isDemo = false }: TrialBannerProps) {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
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

  if (isDemo) {
    return (
      <div className="bg-gradient-to-r from-blue-500/10 to-blue-500/5 rounded-xl border border-blue-500/20 px-5 py-3 flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-blue-500/15 rounded-lg flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
        </div>
        <div>
          <p className="text-sm font-bold text-text">
            데모 체험 중 <span className="text-blue-500">{daysLeft}일 남음</span>
          </p>
          <p className="text-[11px] text-dim">샘플 데이터로 핵심 기능을 자유롭게 둘러보세요.</p>
        </div>
      </div>
    );
  }

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
