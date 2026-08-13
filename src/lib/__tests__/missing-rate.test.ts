import { describe, it, expect } from 'vitest';
import {
  isPostMissing,
  isPostMissingInArea,
  filterMissing,
  countMissing,
  countIndexingWait,
  calculateMissingRate,
  displayVerdict,
  INDEXING_GRACE_HOURS,
  type MissingResultsMap,
} from '../missing-rate';

const post = (id: string) => ({ id });
const postAt = (id: string, publishedAt: Date | null) => ({ id, publishedAt });
const exposed = { exposed: true, rank: 5 };
const missing = { exposed: false, rank: null };
const HOUR_MS = 60 * 60 * 1000;

// 새 규칙(§10): 한 영역이라도 노출이면 노출. "검사한 모든 영역이 미노출"일 때만 미노출 후보.
// (레거시 행 = overallStatus 없음 → 영역값 AND 폴백. OR 아님 — 인플루언서만 빠진 정상 노출글 오탐 제거)
describe('isPostMissing — 새 교차검증 규칙(레거시 폴백)', () => {
  it('한 영역이라도 노출이면 미노출 아님(과거 OR 오탐 제거)', () => {
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: exposed },   // 블로그 노출 → 노출
      b: { viewTab: exposed, blogTab: missing },   // 통합 노출 → 노출
      c: { viewTab: missing, blogTab: missing },   // 전부 미노출 → 미노출
      d: { viewTab: exposed, blogTab: exposed },
    };
    expect(isPostMissing(post('a'), r)).toBe(false);
    expect(isPostMissing(post('b'), r)).toBe(false);
    expect(isPostMissing(post('c'), r)).toBe(true);
    expect(isPostMissing(post('d'), r)).toBe(false);
  });

  it('overallStatus 를 최우선 신뢰: missing 만 미노출, recheck/exposed 는 아님', () => {
    const r: MissingResultsMap = {
      m: { viewTab: missing, blogTab: missing, overallStatus: 'missing' },
      rc: { viewTab: missing, blogTab: missing, overallStatus: 'recheck' },   // 재검증 대기 → 미노출 아님
      ex: { viewTab: missing, blogTab: missing, overallStatus: 'exposed' },   // 서버가 노출로 확정
    };
    expect(isPostMissing(post('m'), r)).toBe(true);
    expect(isPostMissing(post('rc'), r)).toBe(false);
    expect(isPostMissing(post('ex'), r)).toBe(false);
  });

  it('미검사 포스트(결과 없음)는 미노출 아님', () => {
    expect(isPostMissing(post('x'), {})).toBe(false);
  });
});

describe('displayVerdict — §19 화면 상태', () => {
  it('저장된 overall_status 를 그대로 반영', () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: missing, overallStatus: 'recheck' } };
    expect(displayVerdict(post('a'), r.a)).toBe('recheck');
  });

  it('색인 유예 기간 내 missing/recheck 는 확인 중으로 오버레이', () => {
    const now = Date.now();
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: missing, overallStatus: 'missing' } };
    expect(displayVerdict(postAt('a', new Date(now - 1 * HOUR_MS)), r.a, now)).toBe('checking');
  });

  it('레거시(overall 없음): 노출/전영역미노출/오류 폴백', () => {
    expect(displayVerdict(post('a'), { viewTab: exposed, blogTab: missing })).toBe('exposed');
    expect(displayVerdict(post('a'), { viewTab: missing, blogTab: missing })).toBe('missing');
    expect(displayVerdict(post('a'), { viewTab: missing, blogTab: missing, status: 'error' })).toBe('error');
  });
});

describe('countMissing / filterMissing', () => {
  it('카운트와 필터 length가 일치(확정 미노출만)', () => {
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: missing },   // 미노출
      b: { viewTab: exposed, blogTab: exposed },   // 노출
      c: { viewTab: missing, blogTab: missing, overallStatus: 'missing' }, // 미노출
      d: { viewTab: missing, blogTab: missing, overallStatus: 'recheck' }, // 재검증 대기 → 제외
    };
    const posts = [post('a'), post('b'), post('c'), post('d'), post('uncheck')];
    expect(countMissing(posts, r)).toBe(2);
    expect(filterMissing(posts, r)).toHaveLength(2);
  });
});

describe('calculateMissingRate', () => {
  it('30개 중 6개(전영역 미노출) → 20%', () => {
    const r: MissingResultsMap = {};
    const posts = Array.from({ length: 30 }, (_, i) => post(String(i)));
    for (let i = 0; i < 6; i++) r[String(i)] = { viewTab: missing, blogTab: missing };
    for (let i = 6; i < 30; i++) r[String(i)] = { viewTab: exposed, blogTab: exposed };
    expect(calculateMissingRate(posts, r)).toBe(20);
  });

  it('빈 리스트는 0', () => {
    expect(calculateMissingRate([], {})).toBe(0);
  });

  it('전체 미노출은 100', () => {
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: missing },
      b: { viewTab: missing, blogTab: missing },
    };
    expect(calculateMissingRate([post('a'), post('b')], r)).toBe(100);
  });

  it('한 영역만 노출인 글은 분자에서 빠진다(오탐 제거)', () => {
    // 2개 중 1개는 블로그 노출(→노출), 1개는 전영역 미노출(→미노출) = 50%
    const r: MissingResultsMap = {
      a: { viewTab: missing, blogTab: exposed },
      b: { viewTab: missing, blogTab: missing },
    };
    expect(calculateMissingRate([post('a'), post('b')], r)).toBe(50);
  });
});

describe('발행 직후 색인 지연 유예(오탐 방지)', () => {
  const now = Date.now();

  it(`발행 후 ${INDEXING_GRACE_HOURS}시간 이내면 전영역 미노출이어도 미노출 아님`, () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: missing } };
    expect(isPostMissing(postAt('a', new Date(now - 1 * HOUR_MS)), r, now)).toBe(false);
  });

  it(`발행 후 ${INDEXING_GRACE_HOURS}시간이 지나면 동일 데이터도 미노출로 판정`, () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: missing } };
    expect(isPostMissing(postAt('a', new Date(now - (INDEXING_GRACE_HOURS + 1) * HOUR_MS)), r, now)).toBe(true);
  });

  it('publishedAt이 없으면 유예 없이 판정', () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: missing } };
    expect(isPostMissing(post('a'), r, now)).toBe(true);
  });

  it('영역별 판정(isPostMissingInArea)도 동일하게 유예 적용', () => {
    const r: MissingResultsMap = { a: { viewTab: missing, blogTab: exposed } };
    const freshPost = postAt('a', new Date(now - 1 * HOUR_MS));
    expect(isPostMissingInArea(freshPost, r, 'view', now)).toBe(false);
    const oldPost = postAt('a', new Date(now - (INDEXING_GRACE_HOURS + 1) * HOUR_MS));
    expect(isPostMissingInArea(oldPost, r, 'view', now)).toBe(true);
  });

  it('countIndexingWait — 유예 기간 내 전영역 미노출로 잡힐 뻔한 글만 카운트', () => {
    const r: MissingResultsMap = {
      fresh: { viewTab: missing, blogTab: missing },
      old: { viewTab: missing, blogTab: missing },
      freshOk: { viewTab: exposed, blogTab: exposed },
    };
    const posts = [
      postAt('fresh', new Date(now - 1 * HOUR_MS)),
      postAt('old', new Date(now - (INDEXING_GRACE_HOURS + 1) * HOUR_MS)),
      postAt('freshOk', new Date(now - 1 * HOUR_MS)),
    ];
    expect(countIndexingWait(posts, r, now)).toBe(1);
    expect(filterMissing(posts, r, now).map(p => p.id)).toEqual(['old']);
    expect(countMissing(posts, r, now)).toBe(1);
  });
});
