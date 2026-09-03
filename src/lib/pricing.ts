/**
 * pricing.ts — 기업(법인) 요금 단일 소스
 *
 * 화면 표시액·주문 생성액·PortOne 청구액은 전부 calcPrice() 한 곳에서 나온다.
 * 컴포넌트나 API 라우트에 금액 숫자를 직접 쓰지 말 것.
 *
 * ⚠ 개인 요금제(payment-config.ts PLANS)와는 별개다. 이름이 비슷하니 헷갈리지 말 것 —
 *   이쪽은 좌석당 과금(기업), 저쪽은 기간별 정액(개인)이다.
 */

import { planLabel, type PlanKey } from './plans';

export const CURRENCY = 'KRW';
export const BILLING_CYCLE = 'MONTHLY';

export type PlanId = 'BASIC' | 'PRO';

export const PLANS = {
  BASIC: { id: 'BASIC', seatPrice: 5_500 },
  PRO:   { id: 'PRO',   seatPrice: 9_900 },
} as const;

/** 화면에 카드를 늘어놓는 순서. 플랜을 임의로 늘리지 말 것 — BASIC/PRO 2종이다. */
export const PLAN_IDS: readonly PlanId[] = ['BASIC', 'PRO'];

/**
 * 기업 플랜이 좌석에 부여하는 기능 범위.
 * 기업 전용 기능표를 새로 만들지 않고 개인 요금제의 티어 게이팅(sidebar-nav requiredPlan)을
 * 그대로 재사용한다 — 단가도 개인 요금제와 동일하다(5,500 / 9,900).
 */
export const PLAN_TIER: Record<PlanId, PlanKey> = {
  BASIC: 'pro',
  PRO: 'max',
};

/**
 * 기업 플랜 표시명.
 * 🚨 PlanId('BASIC'/'PRO')는 orgs.plan_id 저장값(CHECK 제약)이라 바꾸지 않는다.
 * 화면에는 그 좌석이 실제로 여는 등급 이름을 보여준다 — 기업 'PRO'는 개인 Pro 가 아니라 Max 다.
 */
export const PLAN_LABEL: Record<PlanId, string> = {
  BASIC: planLabel(PLAN_TIER.BASIC),
  PRO: planLabel(PLAN_TIER.PRO),
};

/** 화면 설명 문구. 실제 차단은 sidebar-nav 의 requiredPlan(PLAN_TIER)이 하므로 여기와 어긋나지 않게 할 것. */
export const PLAN_FEATURES: Record<PlanId, readonly string[]> = {
  BASIC: [
    '키워드 순위 추적',
    '글 다듬기',
    'Google 색인 관리',
    '유튜브 음원 추출',
  ],
  PRO: [
    'BASIC의 모든 기능',
    '내 대시보드 · 토픽 · 맞팬 관리',
    'AI 브리핑 · AI 탭 인용 · 글 심층피드백',
    '키워드 챌린지 · 추천 · 대량 조회',
    '인플루언서 전체 리스트',
  ],
};

export function isPlanId(value: unknown): value is PlanId {
  return value === 'BASIC' || value === 'PRO';
}

/** 좌석 최소 인원. 대표(OWNER)도 좌석 하나를 차지한다. 상한은 없다. */
export const MIN_SEATS = 1;

/**
 * 월 청구액(원, VAT 포함) = 좌석당 단가 × 좌석 수.
 *
 * seatCount 는 대표(OWNER) 좌석을 포함한 총 좌석 수다. OWNER 를 빼고 세지 말 것.
 *
 * 금액을 다루므로 잘못된 입력을 0원으로 뭉개지 않고 던진다. 좌석 수가 소수/음수로
 * 흘러들어오면 그대로 청구액이 되어버리기 때문이다.
 */
export function calcPrice(planId: PlanId, seatCount: number): number {
  if (!Number.isInteger(seatCount) || seatCount < MIN_SEATS) {
    throw new RangeError(`seatCount must be an integer >= ${MIN_SEATS}, got ${seatCount}`);
  }
  return PLANS[planId].seatPrice * seatCount;
}

/** 초대 가능 인원. 대표가 좌석 하나를 이미 쓰므로 항상 좌석 수보다 하나 적다. */
export function invitableSeats(seatCount: number): number {
  return Math.max(0, seatCount - 1);
}

/** 가입일 기준 매월 갱신. 일할 계산은 하지 않는다. */
export function calcNextBillingAt(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
