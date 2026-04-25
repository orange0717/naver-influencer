/**
 * 포트원 V2 결제 설정
 */

export interface PaymentPlan {
  amount: number;
  durationDays: number;
  name: string;
  planName: string;
}

// 가격 정책:
//   1개월   = 정가
//   3개월   = 5% 할인  (월가 × 3 × 0.95, 100원 단위 반올림)
//   6개월   = 10% 할인 (월가 × 6 × 0.90)
//   9개월   = 15% 할인 (월가 × 9 × 0.85, 100원 단위 반올림)
//   12개월  = 2개월 무료 (월가 × 10)
export const PAYMENT_PLANS: Record<string, PaymentPlan> = {
  // 예비 인플루언서 (구 블로거) — 월 5,500원
  BLOGGER_MONTHLY: {
    amount: 5500,
    durationDays: 30,
    name: '예비 인플루언서 1개월 이용권',
    planName: 'BLOGGER',
  },
  BLOGGER_3M: {
    amount: 15700,
    durationDays: 90,
    name: '예비 인플루언서 3개월 이용권 (5% 할인)',
    planName: 'BLOGGER',
  },
  BLOGGER_6M: {
    amount: 29700,
    durationDays: 180,
    name: '예비 인플루언서 6개월 이용권 (10% 할인)',
    planName: 'BLOGGER',
  },
  BLOGGER_9M: {
    amount: 42100,
    durationDays: 270,
    name: '예비 인플루언서 9개월 이용권 (15% 할인)',
    planName: 'BLOGGER',
  },
  BLOGGER_ANNUAL: {
    amount: 55000,
    durationDays: 365,
    name: '예비 인플루언서 12개월 이용권 (2개월 무료)',
    planName: 'BLOGGER',
  },
  // 인플루언서 — 월 9,900원
  INFLUENCER_MONTHLY: {
    amount: 9900,
    durationDays: 30,
    name: '인플루언서 1개월 이용권',
    planName: 'INFLUENCER',
  },
  INFLUENCER_3M: {
    amount: 28200,
    durationDays: 90,
    name: '인플루언서 3개월 이용권 (5% 할인)',
    planName: 'INFLUENCER',
  },
  INFLUENCER_6M: {
    amount: 53500,
    durationDays: 180,
    name: '인플루언서 6개월 이용권 (10% 할인)',
    planName: 'INFLUENCER',
  },
  INFLUENCER_9M: {
    amount: 75700,
    durationDays: 270,
    name: '인플루언서 9개월 이용권 (15% 할인)',
    planName: 'INFLUENCER',
  },
  INFLUENCER_ANNUAL: {
    amount: 99000,
    durationDays: 365,
    name: '인플루언서 12개월 이용권 (2개월 무료)',
    planName: 'INFLUENCER',
  },
};
