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
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';

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

/**
 * PortOne 결제창 강제 닫기 — SDK 내부 X 버튼이 안 먹힐 때 사용.
 * V2 는 외부 close API 가 없어, DOM 컨테이너/iframe 을 직접 제거한다.
 */
function forceClosePortonePopup(): boolean {
  const selectors = [
    '#portone-ui-container',
    'div[id^="portone-"]',
    'div[class^="portone-"]',
    'iframe[src*="portone"]',
    'iframe[src*="kpn"]',
    'iframe[src*="paymentwall"]',
  ];
  let removed = false;
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      try { el.remove(); removed = true; } catch {}
    });
  });
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  return removed;
}

let _payCloseBtn: HTMLButtonElement | null = null;
let _payEscHandler: ((e: KeyboardEvent) => void) | null = null;

function showPaymentCloseButton(onClose: () => void) {
  if (_payCloseBtn) return;
  const btn = document.createElement('button');
  btn.id = 'ninflPayCloseBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', '결제창 닫기');
  btn.innerHTML = '✕ 결제창 닫기';
  btn.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px',
    'z-index:2147483647',
    'background:#BF877A', 'color:#fff', 'border:none',
    'padding:10px 16px', 'border-radius:24px',
    'font-size:13px', 'font-weight:700', 'cursor:pointer',
    'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
    'font-family:inherit',
  ].join(';');
  btn.onmouseover = () => { btn.style.background = '#A0705F'; };
  btn.onmouseout  = () => { btn.style.background = '#BF877A'; };
  btn.onclick = () => {
    forceClosePortonePopup();
    hidePaymentCloseButton();
    onClose();
  };
  document.body.appendChild(btn);
  _payCloseBtn = btn;

  _payEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { btn.click(); }
  };
  document.addEventListener('keydown', _payEscHandler);
}

function hidePaymentCloseButton() {
  if (_payCloseBtn) { try { _payCloseBtn.remove(); } catch {} _payCloseBtn = null; }
  if (_payEscHandler) {
    document.removeEventListener('keydown', _payEscHandler);
    _payEscHandler = null;
  }
}

interface Props {
  planKey: string;
  label: string;
  className?: string;
}

export default function BillingButton({ planKey, label, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const router = useRouter();
  const { redirectTo } = useTrialEndedGate();

  // 체험 종료 게이트에서 넘어온 경우 결제 완료 후 원래 가려던 페이지로 복귀
  // (redirectTo는 TrialEndedGateQueryHandler가 URL의 ?redirect=...를 파싱해 컨텍스트에 저장한 값 —
  //  쿼리 파라미터는 모달을 연 직후 URL에서 즉시 제거되므로 여기서 URL을 다시 읽으면 안 된다)
  function postPaymentRedirect(): string {
    return redirectTo ?? '/my';
  }

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

      // 2. PortOne 일회성 결제창 (외부 닫기 버튼 + ESC 핸들러 등록)
      showPaymentCloseButton(() => {
        setMessage({ type: 'info', text: '결제가 취소되었습니다.' });
      });
      let result;
      try {
        result = await window.PortOne.requestPayment({
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
      } finally {
        hidePaymentCloseButton();
      }

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
      setTimeout(() => router.push(postPaymentRedirect()), 1200);
    } catch (e) {
      hidePaymentCloseButton();
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
          'w-full block text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/40'
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
