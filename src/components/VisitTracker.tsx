'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // 세션당 한 번만 기록 (같은 페이지 재방문 방지)
    const key = `visited_${pathname}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
