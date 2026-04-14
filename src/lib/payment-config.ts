/**
 * 포트원 V2 결제 설정
 */

export interface PaymentPlan {
  amount: number;
  durationDays: number;
  name: string;
  planName: string;
}

export const PAYMENT_PLANS: Record<string, PaymentPlan> = {
  BLOGGER_MONTHLY: {
    amount: 5500,
    durationDays: 30,
    name: '블로거 월간 이용권',
    planName: 'BLOGGER',
  },
  BLOGGER_ANNUAL: {
    amount: 60500,
    durationDays: 365,
    name: '블로거 연간 이용권',
    planName: 'BLOGGER',
  },
  INFLUENCER_MONTHLY: {
    amount: 9900,
    durationDays: 30,
    name: '인플루언서 월간 이용권',
    planName: 'INFLUENCER',
  },
  INFLUENCER_ANNUAL: {
    amount: 108900,
    durationDays: 365,
    name: '인플루언서 연간 이용권',
    planName: 'INFLUENCER',
  },
};
