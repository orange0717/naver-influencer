import { describe, it, expect } from 'vitest';
import {
  effectiveTop3,
  top3Ratio,
  newBadge,
  formatChallengeCount,
  latestCrawledAt,
} from '../influencer-list';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-26T00:00:00Z').getTime();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/**
 * 이 파일이 지키는 것: **세어보지 않은 것을 0 으로 말하지 않는다**, 그리고
 * **정렬에 쓰는 값과 화면에 찍는 값이 같아야 한다**.
 */
describe('effectiveTop3 — 정렬과 표시가 같은 분자를 써야 한다', () => {
  it('integrated_top3_count 가 있으면 그것을 쓴다', () => {
    expect(effectiveTop3({ integrated_top3_count: 12, top1_count: 1, top2_count: 1, top3_count: 1 })).toBe(12);
  });

  it('⚠️ 두 값이 갈라져도 한쪽만 골라야 한다 — bulk-crawl-details 는 integrated_top3_count 만 갱신한다', () => {
    const row = { integrated_top3_count: 12, top1_count: 1, top2_count: 1, top3_count: 1 };
    expect(effectiveTop3(row)).not.toBe(3);
  });

  it('integrated_top3_count 가 0/없음이면 top1~3 합으로 대신한다', () => {
    expect(effectiveTop3({ integrated_top3_count: 0, top1_count: 2, top2_count: 3, top3_count: 4 })).toBe(9);
    expect(effectiveTop3({ top1_count: 2, top2_count: 3, top3_count: 4 })).toBe(9);
  });

  it('숫자가 아닌 값이 와도 NaN 을 화면으로 흘리지 않는다', () => {
    expect(effectiveTop3({ integrated_top3_count: null, top1_count: 'x', top2_count: undefined, top3_count: 5 })).toBe(5);
  });
});

describe('top3Ratio — 모수가 없으면 비율이 성립하지 않는다', () => {
  it('챌린지 참여가 0이면 0% 가 아니라 null(모름)이다', () => {
    expect(top3Ratio(0, 0)).toBeNull();
    expect(top3Ratio(3, 0)).toBeNull();
  });

  it('TOP3 가 0이어도 모수가 있으면 진짜 0% 다 — 이건 감추지 않는다', () => {
    expect(top3Ratio(0, 50)).toBe(0);
  });

  it('정상 계산', () => {
    expect(top3Ratio(25, 50)).toBe(0.5);
  });
});

describe('newBadge — NEW 가 옆의 선정일과 앞뒤가 맞아야 한다', () => {
  it('⚠️ 2019년 선정인데 우리가 어제 발견했다고 NEW 를 붙이지 않는다', () => {
    expect(newBadge('2019-03-01', ago(1), NOW)).toBeNull();
  });

  it('최근 선정이면 NEW 다', () => {
    expect(newBadge(ago(5), ago(400), NOW)?.basis).toBe('selected');
  });

  it('선정일을 모를 때만 최초 발견일로 대신 판단하고, 추정이라고 밝힌다', () => {
    const badge = newBadge(null, ago(5), NOW);
    expect(badge?.basis).toBe('discovered');
    expect(badge?.title).toContain('선정일이 확인되지 않아');
  });

  it('선정일도 모르고 발견도 오래됐으면 아무 말 안 한다', () => {
    expect(newBadge(null, ago(400), NOW)).toBeNull();
  });

  it('날짜가 깨져 있어도 NEW 를 붙이지 않는다', () => {
    expect(newBadge('not-a-date', null, NOW)).toBeNull();
  });

  it('미래 날짜(시계 오차 등)를 NEW 로 읽지 않는다', () => {
    expect(newBadge(new Date(NOW + 5 * DAY).toISOString(), null, NOW)).toBeNull();
  });
});

describe('formatChallengeCount — 미수집을 참여 0회로 말하지 않는다', () => {
  it('⚠️ 수집한 적이 없으면 0 이 아니라 "—" 다 (이게 이 파일의 핵심)', () => {
    const r = formatChallengeCount(0, null);
    expect(r.text).toBe('—');
    expect(r.uncollected).toBe(true);
  });

  it('수집했는데 0이면 진짜 참여 0회이므로 0 이라고 쓴다', () => {
    const r = formatChallengeCount(0, ago(1));
    expect(r.text).toBe('0');
    expect(r.uncollected).toBe(false);
  });

  it('참여 수가 있으면 수집 시각을 몰라도 그 값을 그대로 쓴다', () => {
    expect(formatChallengeCount(7, null)).toEqual({ text: '7', uncollected: false });
  });
});

describe('latestCrawledAt — 근거 없는 기준 시각을 만들지 않는다', () => {
  it('수집 시각이 하나도 없으면 null 이다 — 지금 시각을 지어내지 않는다', () => {
    expect(latestCrawledAt([{ lastCrawledAt: null }, {}])).toBeNull();
  });

  it('가장 최근 것을 고른다', () => {
    const recent = ago(1);
    expect(latestCrawledAt([{ lastCrawledAt: ago(10) }, { lastCrawledAt: recent }, { lastCrawledAt: ago(3) }])).toBe(recent);
  });

  it('깨진 날짜는 무시한다', () => {
    const ok = ago(2);
    expect(latestCrawledAt([{ lastCrawledAt: 'garbage' }, { lastCrawledAt: ok }])).toBe(ok);
  });
});
