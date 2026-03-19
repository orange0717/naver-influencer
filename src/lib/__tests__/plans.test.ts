import { describe, it, expect } from 'vitest';
import {
  calculatePrice,
  calculateMonthlyPrice,
  calculateSaving,
  parsePlanFromOrderId,
  findPeriod,
  PLANS,
  PERIODS,
  PRO_PLAN,
  MONTHLY_PRICE,
  YEARLY_PRICE,
} from '../plans';

describe('calculatePrice', () => {
  it('1개월 할인 없이 정확한 가격 계산', () => {
    expect(calculatePrice(19800, 1, 0)).toBe(19800);
  });

  it('12개월 25% 할인 적용', () => {
    // 19800 * 12 * 0.75 = 178200
    expect(calculatePrice(19800, 12, 0.25)).toBe(178200);
  });

  it('할인율 0이면 원래 가격', () => {
    const total = 19800 * 12;
    expect(calculatePrice(19800, 12, 0)).toBe(total);
  });
});

describe('calculateMonthlyPrice', () => {
  it('총 가격을 개월로 나눠 환산', () => {
    expect(calculateMonthlyPrice(178200, 12)).toBe(14850);
  });
});

describe('calculateSaving', () => {
  it('할인 금액 계산', () => {
    const original = 19800 * 12; // 237600
    const discounted = calculatePrice(19800, 12, 0.25); // 178200
    expect(calculateSaving(19800, 12, 0.25)).toBe(original - discounted);
  });

  it('할인 없으면 0', () => {
    expect(calculateSaving(19800, 1, 0)).toBe(0);
  });
});

describe('parsePlanFromOrderId', () => {
  it('PRO 형식 orderId 파싱', () => {
    const result = parsePlanFromOrderId('NINFL_PRO_1M_user123_1234567890');
    expect(result).toEqual({ planName: 'PRO', months: 1 });
  });

  it('레거시 PERSONAL → PRO 변환', () => {
    const result = parsePlanFromOrderId('NINFL_PERSONAL_3M_user123_1234567890');
    expect(result).toEqual({ planName: 'PRO', months: 3 });
  });

  it('레거시 AGENCY → PRO 변환', () => {
    const result = parsePlanFromOrderId('NINFL_AGENCY_12M_user_abc_1234567890');
    expect(result).toEqual({ planName: 'PRO', months: 12 });
  });

  it('레거시 형식은 null 반환', () => {
    expect(parsePlanFromOrderId('NINFL_user123_1234567890')).toBeNull();
  });

  it('잘못된 형식은 null 반환', () => {
    expect(parsePlanFromOrderId('invalid')).toBeNull();
  });
});

describe('findPeriod', () => {
  it('월간 옵션 반환', () => {
    const period = findPeriod(1);
    expect(period).toBeDefined();
    expect(period?.months).toBe(1);
    expect(period?.discount).toBe(0);
  });

  it('연간 옵션 반환', () => {
    const period = findPeriod(12);
    expect(period).toBeDefined();
    expect(period?.months).toBe(12);
    expect(period?.discount).toBe(0.25);
  });

  it('잘못된 개월 수는 undefined', () => {
    expect(findPeriod(7)).toBeUndefined();
  });
});

describe('PRO_PLAN', () => {
  it('단일 PRO 플랜 19,800원', () => {
    expect(PRO_PLAN.basePrice).toBe(19800);
    expect(PRO_PLAN.name).toBe('PRO');
  });
});

describe('PLANS', () => {
  it('4개 플랜 키가 정의 (하위 호환)', () => {
    expect(PLANS.PRO).toBeDefined();
    expect(PLANS.PERSONAL).toBeDefined();
    expect(PLANS.INFLUENCER).toBeDefined();
    expect(PLANS.AGENCY).toBeDefined();
  });

  it('모든 플랜이 동일한 가격 (19,800원)', () => {
    expect(PLANS.PRO.basePrice).toBe(19800);
    expect(PLANS.PERSONAL.basePrice).toBe(19800);
    expect(PLANS.INFLUENCER.basePrice).toBe(19800);
    expect(PLANS.AGENCY.basePrice).toBe(19800);
  });
});

describe('가격 상수', () => {
  it('월간/연간 가격 일치', () => {
    expect(MONTHLY_PRICE).toBe(19800);
    expect(YEARLY_PRICE).toBe(178200);
    expect(calculatePrice(MONTHLY_PRICE, 12, 0.25)).toBe(YEARLY_PRICE);
  });
});

describe('PERIODS', () => {
  it('2개 기간이 정의 (월간/연간)', () => {
    expect(PERIODS).toHaveLength(2);
  });

  it('할인율이 순서대로 증가', () => {
    for (let i = 1; i < PERIODS.length; i++) {
      expect(PERIODS[i].discount).toBeGreaterThanOrEqual(PERIODS[i - 1].discount);
    }
  });
});
