/**
 * BillingButton.tsx — N인플 정기결제 시작 버튼.
 *
 * 흐름:
 *   1. /api/portone/billing/issue 로 paymentId 발급 (서버측 진실 저장)
 *   2. PortOne.requestIssueBillingKey 결제창 호출
 *   3. 빌링키 발급 결과 콜백 → /api/portone/billing/complete 로 검증·구독생성·첫결제
 *   4. 성공 시 /my 로 이동, 실패 시 토스트
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PortOneSDK {
  // ORF 와 동일한 일회성 카드 결제 — KPN 채널은 빌링키 미지원이라 일회성으로 단순화.
  // 정기결제는 빌링키 지원 PG 채널 추가 후 재활성화 예정.
  requestPayment: (params: {
    storeId: string;
    channelKey: string;
    paymentId: string;
    orderName: string;
    totalAmount: number;
    currency: 'CURRENCY_KRW';
    payMethod: 'CARD';
    redirectUrl?: string;
    customer?: { email?: string };
  }) => Promise<{ code?: string; message?: string; paymentId?: string } | undefined>;
}

declare global {
  interface Window { PortOne?: PortOneSDK }
}

const STORE_ID    = process.env.NEXT_PUBLIC_PORTONE_STORE_ID    || '';
const CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || '';

interface Props {
  planKey: string;
  label: string;
  className?: string;
}

export default function BillingButton({ planKey, label, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const router = useRouter();

  async function handleClick() {
    setMessage(null);

    if (!STORE_ID || !CHANNEL_KEY) {
      setMessage({ type: 'error', text: '결제 시스템이 아직 설정되지 않았습니다.' });
      return;
    }
    if (typeof window === 'undefined' || !window.PortOne) {
      setMessage({ type: 'error', text: '결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' });
      return;
    }

    setLoading(true);
    try {
      // 1. 사전등록
      const issueRes = await fetch('/api/portone/billing/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      });
      const issueData = await issueRes.json().catch(() => ({}));
      if (!issueRes.ok || !issueData.paymentId) {
        if (issueRes.status === 401) {
          setMessage({ type: 'error', text: '로그인이 필요합니다.' });
          router.push('/auth/login?next=/subscribe');
          return;
        }
        setMessage({ type: 'error', text: issueData.error || '결제 준비에 실패했습니다.' });
        return;
      }

      // 2. PortOne 일회성 결제창 (ORF 와 동일 흐름)
      const result = await window.PortOne.requestPayment({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        paymentId: issueData.paymentId,
        orderName: issueData.planName || '구독 결제',
        totalAmount: issueData.amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        redirectUrl: typeof window !== 'undefined'
          ? `${window.location.origin}/subscribe?payment=portone`
          : undefined,
      });

      if (result && result.code) {
        if (result.code === 'USER_CANCEL' || result.code === 'FAILURE_TYPE_PG') {
          setMessage({ type: 'info', text: '결제가 취소되었습니다.' });
        } else {
          setMessage({ type: 'error', text: result.message || '결제에 실패했습니다.' });
        }
        return;
      }

      // 3. 결제 검증 + 구독 활성화
      const completeRes = await fetch('/api/portone/billing/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: issueData.paymentId, planKey }),
      });
      const completeData = await completeRes.json().catch(() => ({}));

      if (!completeRes.ok) {
        setMessage({ type: 'error', text: completeData.error || '결제 검증에 실패했습니다.' });
        return;
      }

      // 4. 성공
      setMessage({ type: 'info', text: '결제가 완료되었습니다. 이용권이 활성화되었습니다.' });
      setTimeout(() => router.push('/my'), 1200);
    } catch (e) {
      console.error('[BillingButton] error:', e);
      setMessage({ type: 'error', text: '네트워크 오류. 잠시 후 다시 시도해주세요.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={
          className ||
          'w-full block text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition disabled:opacity-50'
        }
      >
        {loading ? '결제 진행 중…' : label}
      </button>
      {message && (
        <p className={`mt-2 text-xs ${message.type === 'error' ? 'text-down' : 'text-up'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
