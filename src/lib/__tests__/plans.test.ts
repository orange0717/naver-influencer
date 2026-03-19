import { describe, it, expect } from 'vitest';
import {
  calculatePrice,
  calculateMonthlyPrice,
  calculateSaving,
  parsePlanFromOrderId,
  findPeriod,
  PLANS,
  PERIODS,
} from '../plans';

describe('calculatePrice', () => {
  it('1개월 할인 없이 정확한 가격 계산', () => {
    expect(calculatePrice(9900, 1, 0)).toBe(9900);
    expect(calculatePrice(44000, 1, 0)).toBe(44000);
    expect(calculatePrice(99000, 1, 0)).toBe(99000);
  });

  it('3개월 5% 할인 적용', () => {
    // 9900 * 3 * 0.95 = 28215 → 100원 단위 반올림 = 28200
    expect(calculatePrice(9900, 3, 0.05)).toBe(28200);
  });

  it('12개월 11% 할인 적용', () => {
    // 9900 * 12 * 0.89 = 105732 → 100원 단위 반올림 = 105700
    expect(calculatePrice(9900, 12, 0.11)).toBe(105700);
  });

  it('할인율 0이면 원래 가격', () => {
    const total = 9900 * 6;
    expect(calculatePrice(9900, 6, 0)).toBe(total);
  });
});

describe('calculateMonthlyPrice', () => {
  it('총 가격을 개월로 나눠 환산', () => {
    expect(calculateMonthlyPrice(28200, 3)).toBe(9400);
  });
});

describe('calculateSaving', () => {
  it('할인 금액 계산', () => {
    const original = 9900 * 3; // 29700
    const discounted = calculatePrice(9900, 3, 0.05); // 28200
    expect(calculateSaving(9900, 3, 0.05)).toBe(original - discounted);
  });

  it('할인 없으면 0', () => {
    expect(calculateSaving(9900, 1, 0)).toBe(0);
  });
});

describe('parsePlanFromOrderId', () => {
  it('새 형식 orderId 파싱', () => {
    const result = parsePlanFromOrderId('NINFL_PERSONAL_3M_user123_1234567890');
    expect(result).toEqual({ planName: 'PERSONAL', months: 3 });
  });

  it('AGENCY 플랜 파싱', () => {
    const result = parsePlanFromOrderId('NINFL_AGENCY_12M_user_abc_1234567890');
    expect(result).toEqual({ planName: 'AGENCY', months: 12 });
  });

  it('PRO → PERSONAL 호환성', () => {
    const result = parsePlanFromOrderId('NINFL_PRO_1M_user123_1234567890');
    expect(result).toEqual({ planName: 'PERSONAL', months: 1 });
  });

  it('레거시 형식은 null 반환', () => {
    expect(parsePlanFromOrderId('NINFL_user123_1234567890')).toBeNull();
  });

  it('잘못된 형식은 null 반환', () => {
    expect(parsePlanFromOrderId('invalid')).toBeNull();
  });
});

describe('findPeriod', () => {
  it('유효한 개월 수로 PeriodOption 반환', () => {
    const period = findPeriod(3);
    expect(period).toBeDefined();
    expect(period?.months).toBe(3);
    expect(period?.discount).toBe(0.05);
  });

  it('잘못된 개월 수는 undefined', () => {
    expect(findPeriod(7)).toBeUndefined();
  });
});

describe('PLANS', () => {
  it('3개 플랜이 정의되어 있다', () => {
    expect(Object.keys(PLANS)).toHaveLength(3);
    expect(PLANS.PERSONAL).toBeDefined();
    expect(PLANS.INFLUENCER).toBeDefined();
    expect(PLANS.AGENCY).toBeDefined();
  });

  it('가격이 올바르게 설정됨', () => {
    expect(PLANS.PERSONAL.basePrice).toBe(9900);
    expect(PLANS.INFLUENCER.basePrice).toBe(44000);
    expect(PLANS.AGENCY.basePrice).toBe(99000);
  });
});

describe('PERIODS', () => {
  it('5개 기간이 정의되어 있다', () => {
    expect(PERIODS).toHaveLength(5);
  });

  it('할인율이 순서대로 증가', () => {
    for (let i = 1; i < PERIODS.length; i++) {
      expect(PERIODS[i].discount).toBeGreaterThanOrEqual(PERIODS[i - 1].discount);
    }
  });
});
