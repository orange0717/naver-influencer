import { describe, it, expect } from 'vitest';
import fixture from './fixtures/exposure-golden.json';
import { computeVerdict } from '../exposure-verdict';
import { scoreGolden, evaluateTargets, goldenComposition, toVerdictInput, ACCURACY_TARGETS, type GoldenCase } from '../exposure-golden';

const CASES = (fixture.cases ?? []) as GoldenCase[];

/**
 * 골든셋 회귀 — 라벨이 아직 없으면 통째로 skip 한다.
 * 빈 배열을 "정확도 100%"로 통과시키면 골든셋 없이 "정확해졌습니다"를 보고하게 된다(지시서 §6 금지).
 */
describe.skipIf(CASES.length === 0)('노출 판정 골든셋', () => {
  it('30건 이상, 노출/미노출/경계가 각각 존재한다', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(ACCURACY_TARGETS.minCases);
    const comp = goldenComposition(CASES);
    expect(comp.exposed).toBeGreaterThan(0);
    expect(comp.missing).toBeGreaterThan(0);
    expect(comp.boundary).toBeGreaterThan(0);
  });

  it('postId 가 중복되지 않는다', () => {
    expect(new Set(CASES.map(c => c.postId)).size).toBe(CASES.length);
  });

  it('§4.2 정확도 목표를 만족한다', () => {
    const metrics = scoreGolden(CASES);
    const failed = evaluateTargets(metrics).filter(t => !t.pass);
    expect(failed.map(t => `${t.label}=${t.value} (기준 ${t.limit})`)).toEqual([]);
  });

  it('거짓 노출(노출로 판정했으나 실제 미노출)이 한 건도 없다', () => {
    // 지시서가 0건으로 못박은 항목이라 위 목표 검사와 별도로 케이스 목록까지 드러낸다.
    const metrics = scoreGolden(CASES);
    expect(metrics.falseNegativeCases).toEqual([]);
  });
});

describe('골든셋 채점기', () => {
  it('입력을 다시 판정해 채점한다 — 저장된 결과를 읽지 않는다', () => {
    const cases: GoldenCase[] = [
      // 한 영역이라도 노출이면 exposed. 실제로도 노출 → tn
      { postId: 'a', actualExposed: true, input: { view: true, blog: false, inf: null, status: 'ok', consecutiveMissing: 0 } },
      // 전 영역 미노출 2회 연속 → missing 확정. 실제로도 미노출 → tp
      { postId: 'b', actualExposed: false, input: { view: false, blog: false, inf: false, status: 'ok', consecutiveMissing: 2 } },
      // 1회째는 recheck → 미확정(분모 제외)
      { postId: 'c', actualExposed: false, input: { view: false, blog: false, inf: false, status: 'ok', consecutiveMissing: 1 } },
      // 조회 실패는 절대 미노출로 강등하지 않는다 → 미확정
      { postId: 'd', actualExposed: true, input: { view: null, blog: null, inf: null, status: 'error', consecutiveMissing: 0 } },
    ];
    const m = scoreGolden(cases);
    expect(m.labeledTotal).toBe(4);
    expect(m.decided).toBe(2);
    expect(m.undecided).toBe(2);
    expect(m.tp).toBe(1);
    expect(m.tn).toBe(1);
    expect(m.fp).toBe(0);
    expect(m.fn).toBe(0);
    expect(m.accuracy).toBe(1);
  });

  it('거짓 노출과 거짓 미노출을 지시서 용어대로 갈라 센다', () => {
    const m = scoreGolden([
      // 시스템 '미노출' × 실제 노출 = 지시서 「거짓 미노출」 = fp
      { postId: 'fp', actualExposed: true, input: { view: false, blog: false, inf: false, status: 'ok', consecutiveMissing: 2 } },
      // 시스템 '노출' × 실제 미노출 = 지시서 「거짓 노출」 = fn
      { postId: 'fn', actualExposed: false, input: { view: true, blog: null, inf: null, status: 'ok', consecutiveMissing: 0 } },
    ]);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.falsePositiveCases.map(c => c.postId)).toEqual(['fp']);
    expect(m.falseNegativeCases.map(c => c.postId)).toEqual(['fn']);
  });

  it('색인 유예 중인 전 영역 미노출은 경계로 분류된다', () => {
    const comp = goldenComposition([
      { postId: 'g', actualExposed: false, input: { view: false, blog: false, inf: false, status: 'ok', inIndexingGrace: true, consecutiveMissing: 3 } },
    ]);
    expect(comp).toEqual({ exposed: 0, missing: 0, boundary: 1 });
  });

  it('저장 행을 판정 입력으로 되돌릴 때 모르는 status 는 error 로 좁힌다', () => {
    const base = { view: false as const, blog: false as const, inf: false as const, consecutiveMissing: 3 };
    expect(toVerdictInput({ ...base, status: 'failed' }).status).toBe('error');
    expect(toVerdictInput({ ...base, status: null }).status).toBe('ok');
    expect(toVerdictInput({ ...base, status: 'unanalyzable' }).status).toBe('unanalyzable');
    // 'failed' 를 'ok' 로 흘리면 전 영역 미노출 3회가 곧바로 미노출 확정이 된다
    expect(computeVerdict(toVerdictInput({ ...base, status: 'failed' })).verdict).toBe('error');
  });

  it('목표 미달을 항목별로 짚어낸다', () => {
    const m = scoreGolden([
      { postId: 'fn', actualExposed: false, input: { view: true, blog: null, inf: null, status: 'ok', consecutiveMissing: 0 } },
    ]);
    const failed = evaluateTargets(m).filter(t => !t.pass).map(t => t.label);
    expect(failed).toContain('거짓 노출(건)');
    expect(failed).toContain('정확도');
  });
});
