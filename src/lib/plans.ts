/**
 * 플랜 & 기간 설정 상수
 * 단일 PRO 플랜 (19,800원/월, 178,200원/연)
 */

export type PlanKey = 'PRO' | 'PERSONAL' | 'INFLUENCER' | 'AGENCY';

export interface PlanInfo {
  name: PlanKey;
  label: string;
  description: string;
  maxBlogs: number;
  basePrice: number; // 월 기본 가격 (원, VAT 포함)
  supplyPrice: number; // 공급가 (원)
  features: string[];
}

export interface PeriodOption {
  months: number;
  days: number;
  discount: number; // 0 ~ 1 (0.25 = 25%)
  label: string;
}

/** 단일 PRO 플랜 (19,800원/월) */
export const PRO_PLAN: PlanInfo = {
  name: 'PRO',
  label: 'PRO',
  description: '인플루언서 키워드챌린지 분석 · 순위 추적',
  maxBlogs: 1,
  basePrice: 19800,
  supplyPrice: 18000,
  features: [
    '내 키워드 순위 실시간 추적',
    '스마트 알림 (하락 위험 / TOP3 기회)',
    '성장 리포트 (주간/월간 비교)',
    '종합 점수 추이 차트',
    '경쟁자 비교 분석 + 변동 감지',
    '순위 추이 차트 (7/15/30일)',
    '포스팅별 키워드 순위 분석',
    '맞춤 추천 키워드',
    '인플루언서 종합 점수 (6차원)',
    '키워드 순위 위젯 (블로그 삽입)',
  ],
};

/** @deprecated 하위 호환용 - 신규 코드에서는 PRO_PLAN 사용 */
export const PLANS: Record<PlanKey, PlanInfo> = {
  PRO: PRO_PLAN,
  PERSONAL: { ...PRO_PLAN, name: 'PERSONAL' },
  INFLUENCER: { ...PRO_PLAN, name: 'INFLUENCER' },
  AGENCY: { ...PRO_PLAN, name: 'AGENCY' },
};

/** 월간 / 연간 결제 옵션 */
export const MONTHLY_PRICE = 19800;
export const YEARLY_PRICE = 178200;
export const YEARLY_DISCOUNT = 0.25; // 25%

export const PERIODS: PeriodOption[] = [
  { months: 1, days: 30, discount: 0, label: '월간' },
  { months: 12, days: 365, discount: YEARLY_DISCOUNT, label: '연간' },
];

/**
 * 결제 금액 계산
 * @param basePriceMonthly - 월 기본 가격
 * @param months - 개월 수
 * @param discount - 할인율 (0~1)
 * @returns 최종 가격 (100원 단위 반올림)
 */
export function calculatePrice(basePriceMonthly: number, months: number, discount: number): number {
  return Math.round((basePriceMonthly * months * (1 - discount)) / 100) * 100;
}

/**
 * 월 환산 가격 계산
 */
export function calculateMonthlyPrice(totalPrice: number, months: number): number {
  return Math.round(totalPrice / months);
}

/**
 * 할인 금액 계산
 */
export function calculateSaving(basePriceMonthly: number, months: number, discount: number): number {
  const original = basePriceMonthly * months;
  const discounted = calculatePrice(basePriceMonthly, months, discount);
  return original - discounted;
}

/**
 * orderId에서 플랜 정보 추출
 * 형식: NINFL_{planName}_{months}M_{userId}_{timestamp}
 */
export function parsePlanFromOrderId(orderId: string): { planName: PlanKey; months: number } | null {
  const match = orderId.match(/^NINFL_(PERSONAL|INFLUENCER|AGENCY|PRO)_(\d+)M_/);
  if (!match) return null;
  // 레거시 플랜명도 PRO로 통일
  const raw = match[1];
  const planName: PlanKey = (raw === 'PERSONAL' || raw === 'INFLUENCER' || raw === 'AGENCY') ? 'PRO' : raw as PlanKey;
  return {
    planName,
    months: parseInt(match[2], 10),
  };
}

/**
 * 기간(months)으로 PeriodOption 찾기
 */
export function findPeriod(months: number): PeriodOption | undefined {
  return PERIODS.find((p) => p.months === months);
}
