'use client';

import { useState } from 'react';

declare global {
  interface Window {
    PortOne?: {
      requestPayment: (options: Record<string, unknown>) => Promise<{
        code?: string;
        message?: string;
        paymentId?: string;
      }>;
    };
  }
}

interface PaymentButtonProps {
  planKey?: string;
  label?: string;
  className?: string;
}

export default function PaymentButton({
  planKey = 'PRO_ANNUAL',
  label = '결제하기',
  className = '',
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handlePayment() {
    setMessage(null);
    setLoading(true);

    try {
      // 1. PortOne SDK 확인
      if (!window.PortOne) {
        setMessage({ type: 'error', text: '결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' });
        return;
      }

      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

      if (!storeId || !channelKey) {
        setMessage({ type: 'error', text: '결제 시스템이 아직 준비되지 않았습니다.' });
        return;
      }

      // 2. 서버 사전등록
      const prepareRes = await fetch('/api/portone/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      });

      const prepareData = await prepareRes.json();

      if (!prepareRes.ok) {
        setMessage({ type: 'error', text: prepareData.error || '결제 준비에 실패했습니다.' });
        return;
      }

      const { paymentId, amount, orderName, userId } = prepareData;

      // 3. PortOne SDK 결제창 호출
      const response = await window.PortOne!.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName,
        totalAmount: amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: { customerId: userId },
        customData: JSON.stringify({ userId, planKey }),
        redirectUrl: `${window.location.origin}/subscribe?payment=portone&paymentId=${paymentId}`,
      });

      // 4. 결과 처리
      if (response.code) {
        // 사용자 취소 또는 실패
        if (response.code === 'FAILURE_TYPE_PG' || response.message?.includes('취소')) {
          setMessage({ type: 'error', text: '결제가 취소되었습니다.' });
        } else {
          setMessage({ type: 'error', text: response.message || '결제에 실패했습니다.' });
        }
        return;
      }

      // 5. 서버 검증
      await completePayment(paymentId);
    } catch (err) {
      console.error('[Payment] error:', err);
      setMessage({ type: 'error', text: '결제 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={loading}
        className={`block w-full text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition disabled:opacity-50 ${className}`}
      >
        {loading ? '처리 중...' : label}
      </button>
      {message && (
        <p className={`mt-2 text-xs text-center ${message.type === 'error' ? 'text-down' : 'text-up'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * 결제 완료 검증 — 데스크톱 콜백 및 모바일 리다이렉트에서 공용
 */
export async function completePayment(paymentId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/portone/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });

    const data = await res.json();

    if (!res.ok || !data.verified) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
