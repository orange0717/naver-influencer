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
//   1/3/6/9개월 = 정가 (월가 × 개월수)
//   12개월     = 1개월 무료 (월가 × 11)
export const PAYMENT_PLANS: Record<string, PaymentPlan> = {
  // 예비 인플루언서 (구 블로거) — 월 5,500원
  BLOGGER_MONTHLY: {
    amount: 5500,
    durationDays: 30,
    name: '예비 인플루언서 1개월 이용권',
    planName: 'BLOGGER',
  },
  BLOGGER_3M: {
    amount: 16500,
    durationDays: 90,
    name: '예비 인플루언서 3개월 이용권',
    planName: 'BLOGGER',
  },
  BLOGGER_6M: {
    amount: 33000,
    durationDays: 180,
    name: '예비 인플루언서 6개월 이용권',
    planName: 'BLOGGER',
  },
  BLOGGER_9M: {
    amount: 49500,
    durationDays: 270,
    name: '예비 인플루언서 9개월 이용권',
    planName: 'BLOGGER',
  },
  BLOGGER_ANNUAL: {
    amount: 60500,
    durationDays: 365,
    name: '예비 인플루언서 12개월 이용권 (1개월 무료)',
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
    amount: 29700,
    durationDays: 90,
    name: '인플루언서 3개월 이용권',
    planName: 'INFLUENCER',
  },
  INFLUENCER_6M: {
    amount: 59400,
    durationDays: 180,
    name: '인플루언서 6개월 이용권',
    planName: 'INFLUENCER',
  },
  INFLUENCER_9M: {
    amount: 89100,
    durationDays: 270,
    name: '인플루언서 9개월 이용권',
    planName: 'INFLUENCER',
  },
  INFLUENCER_ANNUAL: {
    amount: 108900,
    durationDays: 365,
    name: '인플루언서 12개월 이용권 (1개월 무료)',
    planName: 'INFLUENCER',
  },
};
