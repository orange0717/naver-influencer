/**
 * payment-config.ts — N인플 정기결제 플랜 정의 (Single Source of Truth)
 *
 * SubscribeClient.tsx 의 PRICE_TABLE 과 동일 가격, plan_key 단위로 평탄화.
 * 가격 변경 시 SubscribeClient.tsx 와 함께 업데이트할 것.
 */

type PlanTier = 'blogger' | 'influencer';
type BillingPeriod = 'monthly' | '3m' | '6m' | '9m' | 'annual';

export type PlanKey =
  | 'BLOGGER_MONTHLY' | 'BLOGGER_3M' | 'BLOGGER_6M' | 'BLOGGER_9M' | 'BLOGGER_ANNUAL'
  | 'INFLUENCER_MONTHLY' | 'INFLUENCER_3M' | 'INFLUENCER_6M' | 'INFLUENCER_9M' | 'INFLUENCER_ANNUAL'
  | 'TEST_PAYMENT_100';

export interface PlanDef {
  key: PlanKey;
  tier: PlanTier;
  period: BillingPeriod;
  amount: number;          // 결제 금액 (원)
  months: number;          // 라이센스 기간(개월) = 다음 next_charge_at 계산
  name: string;            // 결제창 표시명
}

const PLANS: Record<PlanKey, PlanDef> = {
  BLOGGER_MONTHLY:    { key: 'BLOGGER_MONTHLY',    tier: 'blogger',    period: 'monthly', amount: 5500,   months: 1,  name: '예비 인플루언서 1개월' },
  BLOGGER_3M:         { key: 'BLOGGER_3M',         tier: 'blogger',    period: '3m',      amount: 15700,  months: 3,  name: '예비 인플루언서 3개월' },
  BLOGGER_6M:         { key: 'BLOGGER_6M',         tier: 'blogger',    period: '6m',      amount: 29700,  months: 6,  name: '예비 인플루언서 6개월' },
  BLOGGER_9M:         { key: 'BLOGGER_9M',         tier: 'blogger',    period: '9m',      amount: 42100,  months: 9,  name: '예비 인플루언서 9개월' },
  BLOGGER_ANNUAL:     { key: 'BLOGGER_ANNUAL',     tier: 'blogger',    period: 'annual',  amount: 55000,  months: 12, name: '예비 인플루언서 12개월' },
  INFLUENCER_MONTHLY: { key: 'INFLUENCER_MONTHLY', tier: 'influencer', period: 'monthly', amount: 9900,   months: 1,  name: '인플루언서 1개월' },
  INFLUENCER_3M:      { key: 'INFLUENCER_3M',      tier: 'influencer', period: '3m',      amount: 28200,  months: 3,  name: '인플루언서 3개월' },
  INFLUENCER_6M:      { key: 'INFLUENCER_6M',      tier: 'influencer', period: '6m',      amount: 53500,  months: 6,  name: '인플루언서 6개월' },
  INFLUENCER_9M:      { key: 'INFLUENCER_9M',      tier: 'influencer', period: '9m',      amount: 75700,  months: 9,  name: '인플루언서 9개월' },
  INFLUENCER_ANNUAL:  { key: 'INFLUENCER_ANNUAL',  tier: 'influencer', period: 'annual',  amount: 99000,  months: 12, name: '인플루언서 12개월' },
  // 임시 테스트 패키지 (UI 비공개, /subscribe?test=1 에서만 노출, 결제 흐름 검증용)
  TEST_PAYMENT_100:   { key: 'TEST_PAYMENT_100',   tier: 'blogger',    period: 'monthly', amount: 100,    months: 1,  name: '결제 테스트 (100원)' },
};

export function getPlan(key: string): PlanDef | null {
  return (PLANS as Record<string, PlanDef>)[key] || null;
}

/** 다음 자동청구 시각 = current_period_end (개월 단위 +N) */
export function calculateNextChargeAt(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}
