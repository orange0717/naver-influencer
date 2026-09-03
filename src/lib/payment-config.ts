/**
 * payment-config.ts — N인플 정기결제 플랜 정의 (Single Source of Truth)
 *
 * SubscribeClient.tsx 의 PRICE_TABLE 과 동일 가격, plan_key 단위로 평탄화.
 * 가격 변경 시 SubscribeClient.tsx 와 함께 업데이트할 것.
 */

// 아래 PlanKey 는 결제 상품 키(BLOGGER_MONTHLY …)라 등급 축과 이름이 겹친다. 별칭으로 갈라 둔다.
import type { PlanKey as PlanCode } from './plans';

/** 유료 등급만. 무료는 결제 대상이 아니다. */
type PaidPlan = Extract<PlanCode, 'pro' | 'max'>;
type BillingPeriod = 'monthly' | '3m' | '6m' | '9m' | 'annual';

export type PlanKey =
  | 'BLOGGER_MONTHLY' | 'BLOGGER_3M' | 'BLOGGER_6M' | 'BLOGGER_9M' | 'BLOGGER_ANNUAL'
  | 'INFLUENCER_MONTHLY' | 'INFLUENCER_3M' | 'INFLUENCER_6M' | 'INFLUENCER_9M' | 'INFLUENCER_ANNUAL'
  | 'TEST_PAYMENT_100';

export interface PlanDef {
  key: PlanKey;
  tier: PaidPlan;
  period: BillingPeriod;
  amount: number;          // 결제 금액 (원)
  months: number;          // 라이센스 기간(개월) = 다음 next_charge_at 계산
  name: string;            // 결제창 표시명
}

/**
 * 🚨 plan_key(BLOGGER_MONTHLY 등)는 과거 결제 이력에 그대로 남아 있는 값이라 바꾸지 않았다.
 * 2026-09-03 등급 명칭이 Pro/Max 로 바뀌었어도 이 키는 옛 이름을 유지한다 —
 * payment_intents·subscriptions 에 저장된 행을 소급 해석해야 하기 때문이다.
 * 사용자에게 보이는 것은 key 가 아니라 name 이다.
 */
const PLANS: Record<PlanKey, PlanDef> = {
  BLOGGER_MONTHLY:    { key: 'BLOGGER_MONTHLY',    tier: 'pro', period: 'monthly', amount: 5500,   months: 1,  name: 'Pro 1개월' },
  BLOGGER_3M:         { key: 'BLOGGER_3M',         tier: 'pro', period: '3m',      amount: 15700,  months: 3,  name: 'Pro 3개월' },
  BLOGGER_6M:         { key: 'BLOGGER_6M',         tier: 'pro', period: '6m',      amount: 29700,  months: 6,  name: 'Pro 6개월' },
  BLOGGER_9M:         { key: 'BLOGGER_9M',         tier: 'pro', period: '9m',      amount: 42100,  months: 9,  name: 'Pro 9개월' },
  BLOGGER_ANNUAL:     { key: 'BLOGGER_ANNUAL',     tier: 'pro', period: 'annual',  amount: 55000,  months: 12, name: 'Pro 12개월' },
  INFLUENCER_MONTHLY: { key: 'INFLUENCER_MONTHLY', tier: 'max', period: 'monthly', amount: 9900,   months: 1,  name: 'Max 1개월' },
  INFLUENCER_3M:      { key: 'INFLUENCER_3M',      tier: 'max', period: '3m',      amount: 28200,  months: 3,  name: 'Max 3개월' },
  INFLUENCER_6M:      { key: 'INFLUENCER_6M',      tier: 'max', period: '6m',      amount: 53500,  months: 6,  name: 'Max 6개월' },
  INFLUENCER_9M:      { key: 'INFLUENCER_9M',      tier: 'max', period: '9m',      amount: 75700,  months: 9,  name: 'Max 9개월' },
  INFLUENCER_ANNUAL:  { key: 'INFLUENCER_ANNUAL',  tier: 'max', period: 'annual',  amount: 99000,  months: 12, name: 'Max 12개월' },
  // 임시 테스트 패키지 (UI 비공개, /subscribe?test=1 에서만 노출, 결제 흐름 검증용)
  TEST_PAYMENT_100:   { key: 'TEST_PAYMENT_100',   tier: 'pro', period: 'monthly', amount: 100,    months: 1,  name: '결제 테스트 (100원)' },
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
