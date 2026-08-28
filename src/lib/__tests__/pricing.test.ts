import { describe, it, expect } from 'vitest';
import { calcPrice, calcNextBillingAt, invitableSeats, isPlanId, PLANS, PLAN_TIER } from '@/lib/pricing';

describe('calcPrice', () => {
  // 요금 정책의 기준값. 이게 깨지면 단가나 산식이 바뀐 것이다.
  it('BASIC 2좌석은 11,000원', () => {
    expect(calcPrice('BASIC', 2)).toBe(11_000);
  });

  it('좌석당 단가 × 좌석 수', () => {
    expect(calcPrice('BASIC', 1)).toBe(5_500);
    expect(calcPrice('BASIC', 10)).toBe(55_000);
    expect(calcPrice('PRO', 1)).toBe(9_900);
    expect(calcPrice('PRO', 3)).toBe(29_700);
  });

  it('좌석 수 상한이 없다', () => {
    expect(calcPrice('PRO', 500)).toBe(4_950_000);
  });

  // 잘못된 좌석 수를 0원으로 뭉개면 공짜로 청구된다. 반드시 던져야 한다.
  it('정수 아닌/최소 미만 좌석 수는 거부', () => {
    expect(() => calcPrice('BASIC', 0)).toThrow(RangeError);
    expect(() => calcPrice('BASIC', -1)).toThrow(RangeError);
    expect(() => calcPrice('BASIC', 1.5)).toThrow(RangeError);
    expect(() => calcPrice('BASIC', NaN)).toThrow(RangeError);
  });

  it('금액은 정수(원)', () => {
    for (const seats of [1, 2, 3, 7, 13, 99]) {
      expect(Number.isInteger(calcPrice('BASIC', seats))).toBe(true);
      expect(Number.isInteger(calcPrice('PRO', seats))).toBe(true);
    }
  });
});

describe('플랜 정의', () => {
  it('플랜은 BASIC/PRO 2종뿐', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['BASIC', 'PRO']);
  });

  it('기존 개인 티어에 매핑된다', () => {
    expect(PLAN_TIER.BASIC).toBe('blogger');
    expect(PLAN_TIER.PRO).toBe('influencer');
  });

  it('isPlanId 는 임의 문자열을 통과시키지 않는다', () => {
    expect(isPlanId('BASIC')).toBe(true);
    expect(isPlanId('PRO')).toBe(true);
    expect(isPlanId('ENTERPRISE')).toBe(false);
    expect(isPlanId('basic')).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
  });
});

describe('invitableSeats', () => {
  // 대표가 좌석을 하나 쓴다는 사실이 화면·API 양쪽에서 같은 숫자로 나와야 한다.
  it('좌석 수보다 항상 하나 적다', () => {
    expect(invitableSeats(2)).toBe(1);
    expect(invitableSeats(10)).toBe(9);
  });

  it('1좌석이면 초대할 자리가 없다', () => {
    expect(invitableSeats(1)).toBe(0);
  });
});

describe('calcNextBillingAt', () => {
  it('가입일 기준 한 달 뒤', () => {
    expect(calcNextBillingAt(new Date('2026-03-10T00:00:00Z')).toISOString())
      .toBe(new Date('2026-04-10T00:00:00Z').toISOString());
  });
});
