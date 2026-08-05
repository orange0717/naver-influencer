import { describe, it, expect } from 'vitest';
import {
  isPostMissing,
  isPostMissingInArea,
  filterMissing,
  countMissing,
  countIndexingWait,
  calculateMissingRate,
  INDEXING_GRACE_HOURS,
  type MissingResultsMap,
} from '../missing-rate';

const post = (id: string) => ({ id });
const postAt = (id: string, publishedAt: Date | null) => ({ id, publishedAt });
const exposed = { exposed: true, rank: 5 };
const missing = { exposed: false, rank: null };
const HOUR_MS = 60 * 60 * 1000;

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

describe('발행 직후 색인 지연 유예(오탐 방지)', () => {
  const now = Date.now();

  it(`발행 후 ${INDEXING_GRACE_HOURS}시간 이내면 미노출이어도 누락 아님`, () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: exposed } };
    const freshPost = postAt('a', new Date(now - 1 * HOUR_MS));
    expect(isPostMissing(freshPost, r, now)).toBe(false);
  });

  it(`발행 후 ${INDEXING_GRACE_HOURS}시간이 지나면 동일 데이터도 누락으로 판정`, () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: exposed } };
    const oldPost = postAt('a', new Date(now - (INDEXING_GRACE_HOURS + 1) * HOUR_MS));
    expect(isPostMissing(oldPost, r, now)).toBe(true);
  });

  it('publishedAt이 없으면 유예 없이 기존 동작 유지', () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: exposed } };
    expect(isPostMissing(post('a'), r, now)).toBe(true);
  });

  it('영역별 판정(isPostMissingInArea)도 동일하게 유예 적용', () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: exposed } };
    const freshPost = postAt('a', new Date(now - 1 * HOUR_MS));
    expect(isPostMissingInArea(freshPost, r, 'view', now)).toBe(false);
    const oldPost = postAt('a', new Date(now - (INDEXING_GRACE_HOURS + 1) * HOUR_MS));
    expect(isPostMissingInArea(oldPost, r, 'view', now)).toBe(true);
  });

  it('countIndexingWait — 유예 기간 내 미노출로 잡힐 뻔한 글만 카운트', () => {
    const r: MissingResultsMap = {
      fresh: { viewTab: missing, blogTab: exposed }, // 유예 기간 내 + 미노출 → 대기중 카운트
      old: { viewTab: missing, blogTab: exposed },   // 유예 기간 지남 → 대기중 아님(진짜 누락)
      freshOk: { viewTab: exposed, blogTab: exposed }, // 유예 기간 내지만 이미 노출 → 대기중 아님
    };
    const posts = [
      postAt('fresh', new Date(now - 1 * HOUR_MS)),
      postAt('old', new Date(now - (INDEXING_GRACE_HOURS + 1) * HOUR_MS)),
      postAt('freshOk', new Date(now - 1 * HOUR_MS)),
    ];
    expect(countIndexingWait(posts, r, now)).toBe(1);
    // 유예 기간 내 글은 filterMissing 목록에서 제외되지만, 유예 기간 지난 글은 그대로 누락 목록에 남음
    expect(filterMissing(posts, r, now).map(p => p.id)).toEqual(['old']);
    expect(countMissing(posts, r, now)).toBe(1);
  });
});
