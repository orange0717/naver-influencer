'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { parsePlanFromOrderId, findPeriod, PLANS } from '@/lib/plans';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [planLabel, setPlanLabel] = useState('PRO');
  const [periodLabel, setPeriodLabel] = useState('30일');

  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (!paymentKey || !orderId || !amount) {
      setStatus('error');
      setMessage('결제 정보가 올바르지 않습니다.');
      return;
    }

    // orderId에서 플랜 정보 파싱
    const planInfo = parsePlanFromOrderId(orderId);
    if (planInfo) {
      const plan = PLANS[planInfo.planName];
      const period = findPeriod(planInfo.months);
      setPlanLabel(`${plan?.label || planInfo.planName}`);
      setPeriodLabel(period?.label || `${planInfo.months}개월`);
    }

    fetch('/api/payment/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount),
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          setExpiresAt(data.license?.expires_at || '');
          setMessage('결제가 완료되었습니다!');
          if (data.license?.plan_name) {
            const plan = PLANS[data.license.plan_name as keyof typeof PLANS];
            if (plan) setPlanLabel(plan.label);
          }
        } else {
          setStatus('error');
          setMessage(data.error || '결제 승인에 실패했습니다.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('네트워크 오류가 발생했습니다.');
      });
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="animate-spin w-10 h-10 border-3 border-accent border-t-transparent rounded-full" />
        <p className="text-sm text-dim">결제를 확인하고 있습니다...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-20">
        <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-down"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        </div>
        <h1 className="text-2xl font-extrabold text-text">결제 실패</h1>
        <p className="text-sm text-dim">{message}</p>
        <Link href="/subscribe" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm">
          다시 시도하기
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-20">
      <div className="w-16 h-16 mx-auto rounded-full bg-up/15 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-up"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h1 className="text-2xl font-extrabold text-text">결제 완료!</h1>
      <p className="text-sm text-dim">{message}</p>

      <div className="bg-surface rounded-2xl border border-border p-6 text-left space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-dim">이용권</span>
          <span className="font-bold">{planLabel} ({periodLabel})</span>
        </div>
        {expiresAt && (
          <div className="flex justify-between text-sm">
            <span className="text-dim">만료일</span>
            <span className="font-bold">
              {new Date(expiresAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-dim">상태</span>
          <span className="font-bold text-up">활성화 완료</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-4">
        <Link href="/my" className="px-8 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm">
          대시보드로 이동
        </Link>
        <Link href="/" className="text-sm text-dim hover:text-text transition">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="animate-spin w-10 h-10 border-3 border-accent border-t-transparent rounded-full" />
        <p className="text-sm text-dim">결제를 확인하고 있습니다...</p>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
