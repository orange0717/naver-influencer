'use client';

import { useState } from 'react';
import { PAYMENT_PLANS } from '@/lib/payment-config';
import { purchase as gaPurchase } from '@/lib/gtag';

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

type TestStep = 'card-select' | 'card-info' | 'processing' | 'complete';

const CARD_COMPANIES = [
  '신한카드', '삼성카드', 'KB국민카드', '현대카드',
  '롯데카드', 'BC카드', '하나카드', 'NH농협카드',
];

export default function PaymentButton({
  planKey = '',
  label = '결제하기',
  className = '',
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 테스트 결제 모달 상태
  const [testModal, setTestModal] = useState(false);
  const [testStep, setTestStep] = useState<TestStep>('card-select');
  const [selectedCard, setSelectedCard] = useState('');

  const plan = PAYMENT_PLANS[planKey];
  const isTestMode = !process.env.NEXT_PUBLIC_PORTONE_STORE_ID || !process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

  async function handlePayment() {
    setMessage(null);
    setLoading(true);

    try {
      if (isTestMode || !window.PortOne) {
        // 테스트 모드: 모달 결제창 표시
        setTestModal(true);
        setTestStep('card-select');
        setSelectedCard('');
        setLoading(false);
        return;
      }

      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!;

      // 서버 사전등록
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

      const { paymentId, amount, orderName } = prepareData;

      // PortOne SDK 결제창 호출
      const response = await window.PortOne!.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName,
        totalAmount: amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customData: JSON.stringify({ planKey }),
        redirectUrl: `${window.location.origin}/subscribe?payment=portone&paymentId=${paymentId}`,
      });

      if (response.code) {
        if (response.code === 'FAILURE_TYPE_PG' || response.message?.includes('취소')) {
          setMessage({ type: 'error', text: '결제가 취소되었습니다.' });
        } else {
          setMessage({ type: 'error', text: response.message || '결제에 실패했습니다.' });
        }
        return;
      }

      const verified = await completePayment(paymentId);
      if (verified) {
        gaPurchase({
          transactionId: paymentId,
          value: amount,
          planKey,
          planName: plan?.name,
        });
      }
    } catch (err) {
      console.error('[Payment] error:', err);
      setMessage({ type: 'error', text: '결제 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  }

  function handleTestCardSelect(card: string) {
    setSelectedCard(card);
    setTestStep('card-info');
  }

  async function handleTestPay() {
    setTestStep('processing');
    try {
      const res = await fetch('/api/portone/test-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setTestStep('complete');
        gaPurchase({
          transactionId: data.paymentId || `test_${Date.now()}`,
          value: plan?.amount || 0,
          planKey,
          planName: plan?.name,
        });
      } else {
        setTestStep('card-info');
        setMessage({ type: 'error', text: data.error || '구독 반영에 실패했습니다.' });
        setTestModal(false);
      }
    } catch {
      setTestStep('card-info');
      setMessage({ type: 'error', text: '네트워크 오류가 발생했습니다.' });
      setTestModal(false);
    }
  }

  function closeTestModal() {
    setTestModal(false);
    setTestStep('card-select');
    setSelectedCard('');
    if (testStep === 'complete') {
      setMessage({ type: 'success', text: '결제가 완료되었습니다. 구독이 활성화되었습니다.' });
    }
  }

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={loading}
        className={`block w-full text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition disabled:opacity-50 cursor-pointer ${className}`}
      >
        {loading ? '처리 중...' : label}
      </button>
      {message && (
        <p className={`mt-2 text-xs text-center ${message.type === 'error' ? 'text-down' : 'text-up'}`}>
          {message.text}
        </p>
      )}

      {/* 테스트 결제 모달 */}
      {testModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={() => testStep !== 'processing' && closeTestModal()}>
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="bg-[#BF8984] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">N인플 결제</span>
                {isTestMode && <span className="text-[10px] text-white/70 bg-white/20 px-2 py-0.5 rounded-full">테스트</span>}
              </div>
              {testStep !== 'processing' && (
                <button onClick={closeTestModal} className="text-white/80 hover:text-white text-lg cursor-pointer">x</button>
              )}
            </div>

            {/* 주문 정보 */}
            {testStep !== 'complete' && (
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">{plan?.name || planKey}</span>
                <span className="text-sm font-bold text-gray-800">{(plan?.amount || 0).toLocaleString()}원</span>
              </div>
            )}

            {/* Step 1: 카드사 선택 */}
            {testStep === 'card-select' && (
              <div className="p-5 space-y-3">
                <p className="text-xs font-semibold text-gray-600">결제수단 선택</p>
                <div className="grid grid-cols-2 gap-2">
                  {CARD_COMPANIES.map(card => (
                    <button
                      key={card}
                      onClick={() => handleTestCardSelect(card)}
                      className="px-3 py-3 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:border-[#BF8984] hover:text-[#BF8984] transition cursor-pointer"
                    >
                      {card}
                    </button>
                  ))}
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 text-center">PortOne 안전결제</p>
                </div>
              </div>
            )}

            {/* Step 2: 카드 정보 입력 */}
            {testStep === 'card-info' && (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => setTestStep('card-select')} className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer">&larr;</button>
                  <p className="text-xs font-semibold text-gray-600">{selectedCard}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">카드번호</label>
                    <div className="flex gap-1">
                      <input type="text" maxLength={4} defaultValue="4242" className="w-1/4 px-2 py-2.5 bg-gray-50 border border-gray-200 rounded text-center text-sm" readOnly />
                      <input type="text" maxLength={4} defaultValue="****" className="w-1/4 px-2 py-2.5 bg-gray-50 border border-gray-200 rounded text-center text-sm" readOnly />
                      <input type="text" maxLength={4} defaultValue="****" className="w-1/4 px-2 py-2.5 bg-gray-50 border border-gray-200 rounded text-center text-sm" readOnly />
                      <input type="text" maxLength={4} defaultValue="4242" className="w-1/4 px-2 py-2.5 bg-gray-50 border border-gray-200 rounded text-center text-sm" readOnly />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-500 block mb-1">유효기간</label>
                      <input type="text" defaultValue="12/28" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded text-sm" readOnly />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 block mb-1">CVC</label>
                      <input type="text" defaultValue="***" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded text-sm" readOnly />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleTestPay}
                  className="w-full py-3 bg-[#BF8984] text-white font-bold text-sm rounded-xl hover:bg-[#a87a75] transition cursor-pointer"
                >
                  {(plan?.amount || 0).toLocaleString()}원 결제하기
                </button>
                <p className="text-[10px] text-gray-400 text-center">PortOne 안전결제로 처리됩니다</p>
              </div>
            )}

            {/* Step 3: 처리 중 */}
            {testStep === 'processing' && (
              <div className="p-10 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#BF8984]/30 border-t-[#BF8984] rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-600 font-semibold">결제 처리 중...</p>
                <p className="text-xs text-gray-400">잠시만 기다려주세요</p>
              </div>
            )}

            {/* Step 4: 완료 */}
            {testStep === 'complete' && (
              <div className="p-8 text-center space-y-4">
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <div>
                  <p className="text-lg font-extrabold text-gray-800">결제 완료</p>
                  <p className="text-sm text-gray-500 mt-1">{plan?.name}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">결제금액</span>
                    <span className="font-bold text-gray-800">{(plan?.amount || 0).toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">결제수단</span>
                    <span className="text-gray-700">{selectedCard}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">이용기간</span>
                    <span className="text-gray-700">{plan?.durationDays}일</span>
                  </div>
                </div>
                <button
                  onClick={closeTestModal}
                  className="w-full py-3 bg-[#BF8984] text-white font-bold text-sm rounded-xl hover:bg-[#a87a75] transition cursor-pointer"
                >
                  확인
                </button>
              </div>
            )}
          </div>
        </div>
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
