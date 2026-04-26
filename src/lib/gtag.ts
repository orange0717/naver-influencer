/**
 * Google Analytics 4 (GA4) gtag 헬퍼
 * 환경변수 NEXT_PUBLIC_GA_ID 미설정 시 모든 호출은 no-op.
 */

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || '';

export const isGaEnabled = (): boolean =>
  Boolean(GA_MEASUREMENT_ID) && typeof window !== 'undefined';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** SPA 라우팅 시 page_view 전송 */
export function pageview(url: string) {
  if (!isGaEnabled() || !window.gtag) return;
  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: url,
  });
}

/** 일반 이벤트 전송 */
export function event(name: string, params: Record<string, unknown> = {}) {
  if (!isGaEnabled() || !window.gtag) return;
  window.gtag('event', name, params);
}

/** 회원가입 — GA4 권장 이벤트 */
export function signUp(method: string = 'email') {
  event('sign_up', { method });
}

/** 로그인 — GA4 권장 이벤트 */
export function login(method: string = 'email') {
  event('login', { method });
}

/** 결제 완료 — GA4 전자상거래 권장 이벤트 */
export function purchase(params: {
  transactionId: string;
  value: number;
  currency?: string;
  planKey?: string;
  planName?: string;
}) {
  event('purchase', {
    transaction_id: params.transactionId,
    value: params.value,
    currency: params.currency || 'KRW',
    items: [
      {
        item_id: params.planKey || 'unknown',
        item_name: params.planName || params.planKey || 'subscription',
        price: params.value,
        quantity: 1,
      },
    ],
  });
}

/** 주요 버튼 클릭 — 커스텀 이벤트 */
export function clickAction(action: string, params: Record<string, unknown> = {}) {
  event('click_action', { action, ...params });
}
