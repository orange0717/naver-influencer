/**
 * 플랜 & 기간 설정 상수
 * PRO (개인) / AGENCY (대행사) 플랜
 * 1 / 3 / 6 / 10 / 12개월 기간 옵션
 */

export type PlanKey = 'PRO' | 'AGENCY';

export interface PlanInfo {
  name: PlanKey;
  label: string;
  description: string;
  maxBlogs: number;
  basePrice: number; // 월 기본 가격 (원)
  features: string[];
}

export interface PeriodOption {
  months: number;
  days: number;
  discount: number; // 0 ~ 1 (0.05 = 5%)
  label: string;
}

export const PLANS: Record<PlanKey, PlanInfo> = {
  PRO: {
    name: 'PRO',
    label: '개인',
    description: '블로거 · 인플루언서 개인 사용',
    maxBlogs: 1,
    basePrice: 9900,
    features: [
      '키워드 상세 분석 무제한',
      '인플루언서 순위 전체 열람',
      '검색량 트렌드 차트',
      '일일 추천 키워드 전체',
      '내 대시보드 + 경쟁자 비교',
      '실시간 데이터 업데이트',
    ],
  },
  AGENCY: {
    name: 'AGENCY',
    label: '대행사',
    description: '마케팅 대행사 · 다중 블로그 관리',
    maxBlogs: 10,
    basePrice: 49900,
    features: [
      'PRO 기능 전체 포함',
      '최대 10개 블로그 동시 관리',
      '블로그별 6가지 점수 분석',
      '대행사 전용 대시보드',
      '블로그 성과 비교 · 모니터링',
      '클라이언트 리포트 (예정)',
    ],
  },
};

export const PERIODS: PeriodOption[] = [
  { months: 1, days: 30, discount: 0, label: '1개월' },
  { months: 3, days: 90, discount: 0.05, label: '3개월' },
  { months: 6, days: 180, discount: 0.07, label: '6개월' },
  { months: 10, days: 300, discount: 0.09, label: '10개월' },
  { months: 12, days: 365, discount: 0.11, label: '12개월' },
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
  const match = orderId.match(/^NINFL_(PRO|AGENCY)_(\d+)M_/);
  if (!match) return null;
  return {
    planName: match[1] as PlanKey,
    months: parseInt(match[2], 10),
  };
}

/**
 * 기간(months)으로 PeriodOption 찾기
 */
export function findPeriod(months: number): PeriodOption | undefined {
  return PERIODS.find((p) => p.months === months);
}
