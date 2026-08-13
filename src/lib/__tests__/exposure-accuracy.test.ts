import { describe, it, expect } from 'vitest';
import { computeAccuracy, type LabeledCase } from '../exposure-accuracy';

const c = (postId: string, overallStatus: string | null, actualExposed: boolean): LabeledCase =>
  ({ postId, overallStatus, actualExposed });

describe('computeAccuracy (§20/§21)', () => {
  it('혼동행렬·정밀도·재현율 계산', () => {
    const cases: LabeledCase[] = [
      c('tp1', 'missing', false),  // 미노출 판정 & 실제 미노출 → TP
      c('tp2', 'missing', false),  // TP
      c('fp1', 'missing', true),   // 미노출 판정 & 실제 노출 → FP ★
      c('fn1', 'exposed', false),  // 노출 판정 & 실제 미노출 → FN
      c('tn1', 'exposed', true),   // 노출 판정 & 실제 노출 → TN
      c('un1', 'recheck', false),  // 미결정 → 제외
      c('un2', null, true),        // 미검사 → 제외
    ];
    const m = computeAccuracy(cases);
    expect(m.tp).toBe(2);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.tn).toBe(1);
    expect(m.decided).toBe(5);
    expect(m.undecided).toBe(2);
    expect(m.precision).toBeCloseTo(2 / 3);   // TP/(TP+FP)=2/3
    expect(m.recall).toBeCloseTo(2 / 3);      // TP/(TP+FN)=2/3
    expect(m.accuracy).toBeCloseTo(3 / 5);    // (TP+TN)/decided
  });

  it('FP 케이스(실제 노출인데 미노출 판정)를 별도로 수집 — 최우선 관리 지표', () => {
    const m = computeAccuracy([
      c('a', 'missing', true),   // FP
      c('b', 'missing', false),  // TP
    ]);
    expect(m.fp).toBe(1);
    expect(m.falsePositiveCases.map(x => x.postId)).toEqual(['a']);
  });

  it('결정된 예측이 없으면 지표는 null(0 나눗셈 방지)', () => {
    const m = computeAccuracy([c('x', 'recheck', false), c('y', 'checking', true)]);
    expect(m.decided).toBe(0);
    expect(m.precision).toBeNull();
    expect(m.recall).toBeNull();
    expect(m.accuracy).toBeNull();
  });
});
