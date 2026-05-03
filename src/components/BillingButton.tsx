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
  requestIssueBillingKey: (params: {
    storeId: string;
    channelKey: string;
    billingKeyMethod: 'CARD';
    issueId: string;
    issueName: string;
    customer?: { customerId?: string; email?: string };
    redirectUrl?: string;
    noticeUrls?: string[];
  }) => Promise<{ billingKey?: string; code?: string; message?: string } | undefined>;
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

      // 2. PortOne 빌링키 발급창
      const result = await window.PortOne.requestIssueBillingKey({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        billingKeyMethod: 'CARD',
        issueId: issueData.paymentId,
        issueName: issueData.planName || '정기결제 등록',
        redirectUrl: typeof window !== 'undefined'
          ? `${window.location.origin}/subscribe?payment=portone`
          : undefined,
      });

      if (!result || result.code) {
        if (result?.code === 'USER_CANCEL') {
          setMessage({ type: 'info', text: '결제가 취소되었습니다.' });
        } else {
          setMessage({ type: 'error', text: result?.message || '빌링키 발급에 실패했습니다.' });
        }
        return;
      }
      if (!result.billingKey) {
        setMessage({ type: 'error', text: '빌링키를 받지 못했습니다.' });
        return;
      }

      // 3. 발급 완료 + 첫 결제
      const completeRes = await fetch('/api/portone/billing/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingKey: result.billingKey, planKey }),
      });
      const completeData = await completeRes.json().catch(() => ({}));

      if (completeRes.status === 402) {
        setMessage({ type: 'error', text: '카드는 등록되었지만 첫 결제가 실패했습니다. 다른 카드로 다시 시도해주세요.' });
        return;
      }
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
