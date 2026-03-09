'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 기존 /charge 페이지 → /subscribe로 리다이렉트
 * (포인트 충전제 → 구독제 전환)
 */
export default function ChargePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/subscribe');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-dim">구독 페이지로 이동 중...</p>
      </div>
    </div>
  );
}
