/**
 * 플랜 & 기간 설정 상수
 * PRO (개인) / AGENCY (대행사) 플랜
 * 1 / 3 / 6 / 10 / 12개월 기간 옵션
 */

export type PlanKey = 'PERSONAL' | 'INFLUENCER' | 'AGENCY';

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
  discount: number; // 0 ~ 1 (0.05 = 5%)
  label: string;
}

export const PLANS: Record<PlanKey, PlanInfo> = {
  PERSONAL: {
    name: 'PERSONAL',
    label: '개인',
    description: '일반 블로거 · 키워드 분석 입문',
    maxBlogs: 1,
    basePrice: 9900,
    supplyPrice: 9000,
    features: [
      '키워드 상세 분석',
      '검색량 트렌드 차트',
      '기본 대시보드',
      '일일 추천 키워드',
      '블로그 등급 위젯',
      '실시간 데이터 업데이트',
    ],
  },
  INFLUENCER: {
    name: 'INFLUENCER',
    label: '인플루언서',
    description: '네이버 인플루언서 · 키워드챌린지 분석',
    maxBlogs: 1,
    basePrice: 44000,
    supplyPrice: 40000,
    features: [
      '개인 플랜 전체 포함',
      '인플루언서 순위 전체 열람',
      '키워드챌린지 순위 추적',
      '경쟁자 비교 분석',
      '순위 위젯 (블로그 삽입)',
      '맞춤 추천 키워드 전체',
    ],
  },
  AGENCY: {
    name: 'AGENCY',
    label: '대행사',
    description: '마케팅 대행사 · 다중 블로그 관리',
    maxBlogs: 10,
    basePrice: 99000,
    supplyPrice: 90000,
    features: [
      '인플루언서 플랜 전체 포함',
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
  const match = orderId.match(/^NINFL_(PERSONAL|INFLUENCER|AGENCY|PRO)_(\d+)M_/);
  if (!match) return null;
  // PRO → PERSONAL 호환성 유지
  const planName = (match[1] === 'PRO' ? 'PERSONAL' : match[1]) as PlanKey;
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
