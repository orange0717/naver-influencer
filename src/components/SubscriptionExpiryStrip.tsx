'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'sub-expiry-strip-dismissed';

export default function SubscriptionExpiryStrip() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (!user.subscriptionPlan || !user.subscriptionExpiresAt) return null;

  const expiresMs = new Date(user.subscriptionExpiresAt).getTime();
  if (Number.isNaN(expiresMs)) return null;

  const diffMs = expiresMs - Date.now();
  const isExpired = diffMs <= 0;
  const daysLeft = Math.ceil(diffMs / DAY_MS);
  const expiredDays = Math.ceil(-diffMs / DAY_MS);

  if (!isExpired && daysLeft > 7) return null;
  if (isExpired && expiredDays > 30) return null;
  if (dismissed && !isExpired) return null;

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  if (isExpired) {
    return (
      <div className="bg-down/15 border-b border-down/30 px-4 py-2 text-xs text-text flex items-center justify-center gap-3 flex-wrap">
        <span>구독이 <strong>{expiredDays}일 전 만료</strong>되었습니다. 현재 무료 플랜으로 이용 중.</span>
        <Link href="/subscribe" className="px-3 py-1 bg-down text-white font-bold rounded-md hover:opacity-90 transition">갱신</Link>
      </div>
    );
  }

  return (
    <div className="bg-accent/15 border-b border-accent/30 px-4 py-2 text-xs text-text flex items-center justify-center gap-3 flex-wrap">
      <span>구독 만료 <strong>{daysLeft}일</strong> 남음. 미리 갱신하면 끊김 없이 이용 가능합니다.</span>
      <Link href="/subscribe" className="px-3 py-1 bg-accent text-white font-bold rounded-md hover:bg-accent-hover transition">갱신하기</Link>
      <button onClick={handleDismiss} className="text-dim hover:text-text font-bold" aria-label="닫기">×</button>
    </div>
  );
}
