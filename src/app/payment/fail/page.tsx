'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function PaymentFailContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';
  const message = searchParams.get('message') || '결제가 취소되었거나 실패했습니다.';

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-20">
      <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-down"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
      </div>
      <h1 className="text-2xl font-extrabold text-text">결제 실패</h1>
      <p className="text-sm text-dim">{message}</p>
      {code && <p className="text-xs text-dim/60">오류 코드: {code}</p>}

      <div className="flex flex-col gap-3 pt-4">
        <Link href="/subscribe" className="px-8 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm">
          다시 시도하기
        </Link>
        <Link href="/" className="text-sm text-dim hover:text-text transition">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    }>
      <PaymentFailContent />
    </Suspense>
  );
}
