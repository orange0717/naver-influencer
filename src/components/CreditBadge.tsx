'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * 헤더에 표시하는 크레딧 잔액 배지 (명세 8: "PRO · 크레딧 1,250").
 * 구독 상태(UsageQuotaBadge)와 별개로, 크레딧 사용량을 독립 표시한다.
 * 로그인 사용자만 노출. 클릭 시 이용권(크레딧 충전) 페이지로 이동.
 */
export default function CreditBadge() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user.id) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    fetch('/api/credits/balance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.balance === 'number') {
          setBalance(data.balance);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (balance === null) return null;

  return (
    <Link
      href="/subscribe"
      title={`보유 크레딧 ${balance.toLocaleString()} · 충전하기`}
      className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-normal leading-none bg-sunken text-text-2 hover:bg-surface-hover transition-colors shrink-0"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9 9.5h4a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h4" />
      </svg>
      크레딧 {balance.toLocaleString()}
    </Link>
  );
}
