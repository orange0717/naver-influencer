'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PaymentButton, { completePayment } from '@/components/PaymentButton';
import { PAYMENT_PLANS } from '@/lib/payment-config';

interface SubscribeClientProps {
  features: string[];
}

export default function SubscribeClient({ features }: SubscribeClientProps) {
  const searchParams = useSearchParams();
  const [callbackStatus, setCallbackStatus] = useState<'processing' | 'success' | 'error' | null>(null);

  const plan = PAYMENT_PLANS.PRO_ANNUAL;
  const priceReady = plan.amount > 0;
  const priceLabel = priceReady
    ? (plan.amount >= 10000
      ? `${Math.floor(plan.amount / 10000)}만${plan.amount % 10000 ? (plan.amount % 10000).toLocaleString() : ''}원`
      : `${plan.amount.toLocaleString()}원`)
    : '미정';

  // 모바일 리다이렉트 콜백 처리
  useEffect(() => {
    const payment = searchParams.get('payment');
    const paymentId = searchParams.get('paymentId');

    if (payment === 'portone' && paymentId) {
      setCallbackStatus('processing');

      completePayment(paymentId).then((success) => {
        setCallbackStatus(success ? 'success' : 'error');
        // URL 정리
        window.history.replaceState({}, '', '/subscribe');
      });
    }
  }, [searchParams]);

  return (
    <div className="bg-surface rounded-2xl border-2 border-accent p-6 space-y-5 relative">
      <div className="absolute -top-3 left-6 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full">
        추천
      </div>
      <div>
        <p className="text-xs text-accent font-semibold">PRO</p>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-3xl font-black">{priceLabel}</span>
          {priceReady && <span className="text-sm text-dim">/ 연</span>}
        </div>
      </div>
      <p className="text-sm text-dim leading-relaxed">
        대시보드의 모든 기능을 1년간 이용하세요.
      </p>

      {/* 콜백 상태 메시지 */}
      {callbackStatus === 'processing' && (
        <p className="text-xs text-center text-dim">결제 확인 중...</p>
      )}
      {callbackStatus === 'success' && (
        <p className="text-xs text-center text-up font-semibold">
          결제가 완료되었습니다. PRO 이용권이 활성화되었습니다.
        </p>
      )}
      {callbackStatus === 'error' && (
        <p className="text-xs text-center text-down font-semibold">
          결제 확인에 실패했습니다. 관리자에게 문의해주세요.
        </p>
      )}

      {/* 결제 버튼 — 가격 확정 후 활성화 */}
      {!callbackStatus && priceReady && (
        <PaymentButton
          planKey="PRO_ANNUAL"
          label={`${priceLabel} 결제하기`}
        />
      )}
      {!callbackStatus && !priceReady && (
        <p className="text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl">
          준비 중
        </p>
      )}

      <ul className="space-y-2.5 text-sm">
        {features.map(f => (
          <li key={f} className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
            <span className="text-text">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
