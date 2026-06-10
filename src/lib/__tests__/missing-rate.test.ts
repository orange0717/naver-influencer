import { describe, it, expect } from 'vitest';
import {
  isPostMissing,
  filterMissing,
  countMissing,
  calculateMissingRate,
  type MissingResultsMap,
} from '../missing-rate';

const post = (id: string) => ({ id });
const exposed = { exposed: true, rank: 5 };
const missing = { exposed: false, rank: null };

describe('isPostMissing', () => {
  it('통합 또는 블로그탭 둘 중 하나라도 미노출이면 누락', () => {
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: exposed },
      b: { viewTab: exposed, blogTab: missing },
      c: { viewTab: missing, blogTab: missing },
      d: { viewTab: exposed, blogTab: exposed },
    };
    expect(isPostMissing(post('a'), r)).toBe(true);
    expect(isPostMissing(post('b'), r)).toBe(true);
    expect(isPostMissing(post('c'), r)).toBe(true);
    expect(isPostMissing(post('d'), r)).toBe(false);
  });

  it('미검사 포스트(결과 없음)는 누락 아님', () => {
    expect(isPostMissing(post('x'), {})).toBe(false);
  });
});

describe('countMissing / filterMissing', () => {
  it('카운트와 필터 length가 일치', () => {
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: exposed },
      b: { viewTab: exposed, blogTab: exposed },
      c: { viewTab: exposed, blogTab: missing },
    };
    const posts = [post('a'), post('b'), post('c'), post('uncheck')];
    expect(countMissing(posts, r)).toBe(2);
    expect(filterMissing(posts, r)).toHaveLength(2);
  });
});

describe('calculateMissingRate', () => {
  it('30개 중 6개 누락 시 20%', () => {
    const r: MissingResultsMap = {};
    const posts = Array.from({ length: 30 }, (_, i) => post(String(i)));
    for (let i = 0; i < 6; i++) r[String(i)] = { viewTab: missing, blogTab: exposed };
    for (let i = 6; i < 30; i++) r[String(i)] = { viewTab: exposed, blogTab: exposed };
    expect(calculateMissingRate(posts, r)).toBe(20);
  });

  it('빈 리스트는 0', () => {
    expect(calculateMissingRate([], {})).toBe(0);
  });

  it('전체 누락은 100', () => {
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: missing },
      b: { viewTab: missing, blogTab: exposed },
    };
    expect(calculateMissingRate([post('a'), post('b')], r)).toBe(100);
  });

  it('미검사 포스트가 섞이면 분모는 그대로 유지(보수적)', () => {
    // 10개 중 검사된 5개 모두 노출 → 누락 0개 / 분모 10 = 0%
    const r: MissingResultsMap = {};
    const posts = Array.from({ length: 10 }, (_, i) => post(String(i)));
    for (let i = 0; i < 5; i++) r[String(i)] = { viewTab: exposed, blogTab: exposed };
    expect(calculateMissingRate(posts, r)).toBe(0);
  });

  it('소수점 반올림 — 7/30 = 23.33% → 23%', () => {
    const r: MissingResultsMap = {};
    const posts = Array.from({ length: 30 }, (_, i) => post(String(i)));
    for (let i = 0; i < 7; i++) r[String(i)] = { viewTab: missing, blogTab: exposed };
    for (let i = 7; i < 30; i++) r[String(i)] = { viewTab: exposed, blogTab: exposed };
    expect(calculateMissingRate(posts, r)).toBe(23);
  });
});
