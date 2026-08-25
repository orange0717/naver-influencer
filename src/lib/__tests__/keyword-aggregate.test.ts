import { describe, it, expect } from 'vitest';
import {
  buildKeywordStats,
  bucketIdForRank,
  emptyKeywordStats,
  isStaleSync,
  RANK_BUCKETS,
  STALE_AFTER_MS,
  sumBuckets,
  TOP3_BUCKETS,
  TOP10_BUCKETS,
  type KeywordStats,
} from '../keyword/aggregate';
import { selectParticipation, type RankingRow } from '../keyword/participation';

const ranks = (...list: (number | null)[]) => list.map((rank) => ({ rank }));

/** 사용자가 실제로 신고한 데이터 (2026-08-26): 분포 합 572, 참여는 586으로 보였다. */
const REPORTED = {
  r1: 66, r2: 50, r3: 39, r4: 42, r5: 31,
  r6_10: 111, r11_20: 112, r21_30: 59, r30plus: 62,
  unranked: 14,
};

function reportedItems() {
  const items: { rank: number | null }[] = [];
  const push = (n: number, rank: number | null) => {
    for (let i = 0; i < n; i++) items.push({ rank });
  };
  push(REPORTED.r1, 1);
  push(REPORTED.r2, 2);
  push(REPORTED.r3, 3);
  push(REPORTED.r4, 4);
  push(REPORTED.r5, 5);
  push(REPORTED.r6_10, 8);
  push(REPORTED.r11_20, 15);
  push(REPORTED.r21_30, 25);
  push(REPORTED.r30plus, 44);
  push(REPORTED.unranked, null);
  return items;
}

// ─── 불변식: 이 블록이 이번 버그의 재발 방지선이다 ───
describe('불변식', () => {
  const cases: Record<string, KeywordStats> = {
    '신고된 실제 분포': buildKeywordStats(reportedItems()),
    '빈 계정': emptyKeywordStats(),
    '순위 없음만': buildKeywordStats(ranks(null, null, null)),
    '1위만': buildKeywordStats(ranks(1, 1)),
    '경계값 전부': buildKeywordStats(ranks(1, 2, 3, 4, 5, 6, 10, 11, 20, 21, 30, 31, 999, null)),
  };

  for (const [name, stats] of Object.entries(cases)) {
    it(`${name}: total = Σ(모든 버킷)`, () => {
      expect(stats.total).toBe(stats.buckets.reduce((a, b) => a + b.count, 0));
    });
    it(`${name}: top3 = r1+r2+r3`, () => {
      expect(stats.top3).toBe(sumBuckets(stats.buckets, TOP3_BUCKETS));
    });
    it(`${name}: top10 = r1..r5 + r6_10`, () => {
      expect(stats.top10).toBe(sumBuckets(stats.buckets, TOP10_BUCKETS));
    });
  }

  it('신고된 화면 수치를 그대로 재현한다 — 총계는 586이 아니라 572+14', () => {
    const stats = buildKeywordStats(reportedItems());
    expect(stats.top3).toBe(155);
    expect(stats.top10).toBe(339);
    // 순위가 확인된 572개 + 순위 없음 14개. 예전엔 총계 586만 뜨고 분포 합은 572였다.
    expect(sumBuckets(stats.buckets, RANK_BUCKETS.map((b) => b.id))).toBe(572);
    expect(stats.total).toBe(586);
  });
});

describe('버킷 경계', () => {
  it('경계값이 정확히 한 버킷에만 속한다', () => {
    expect(bucketIdForRank(1)).toBe('r1');
    expect(bucketIdForRank(5)).toBe('r5');
    expect(bucketIdForRank(6)).toBe('r6_10');
    expect(bucketIdForRank(10)).toBe('r6_10');
    expect(bucketIdForRank(11)).toBe('r11_20');
    expect(bucketIdForRank(20)).toBe('r11_20');
    expect(bucketIdForRank(21)).toBe('r21_30');
    expect(bucketIdForRank(30)).toBe('r21_30');
    expect(bucketIdForRank(31)).toBe('r30plus');
    expect(bucketIdForRank(9999)).toBe('r30plus');
  });

  it('순위 없음을 30위+에 합치지 않는다 — 낮은 순위와 없는 순위는 다른 상태다', () => {
    expect(bucketIdForRank(null)).toBe('unranked');
    expect(bucketIdForRank(undefined)).toBe('unranked');
    expect(bucketIdForRank(0)).toBe('unranked');   // 네이버는 미노출을 rank=0으로 준다
    expect(bucketIdForRank(-1)).toBe('unranked');
    expect(bucketIdForRank(Number.NaN)).toBe('unranked');
    const stats = buildKeywordStats(ranks(null, 0, 44));
    expect(stats.buckets.find((b) => b.id === 'r30plus')?.count).toBe(1);
    expect(stats.buckets.find((b) => b.id === 'unranked')?.count).toBe(2);
  });

  it('rank IS NULL 행이 unranked 에 잡히고 total 에도 포함된다', () => {
    const stats = buildKeywordStats(ranks(1, null, null));
    expect(stats.buckets.find((b) => b.id === 'unranked')?.count).toBe(2);
    expect(stats.total).toBe(3);
  });
});

describe('버킷 노출 규칙', () => {
  it('count 0이어도 순위 버킷 9개를 항상 같은 순서로 준다', () => {
    const stats = emptyKeywordStats();
    expect(stats.buckets.map((b) => b.id)).toEqual(RANK_BUCKETS.map((b) => b.id));
  });

  it('unranked 는 있을 때만, 그리고 항상 배열 끝에 붙는다', () => {
    expect(buildKeywordStats(ranks(1)).buckets.some((b) => b.id === 'unranked')).toBe(false);
    const withUnranked = buildKeywordStats(ranks(1, null)).buckets;
    expect(withUnranked[withUnranked.length - 1].id).toBe('unranked');
  });

  it('타일 숫자의 합이 화면 총계와 같다 (분포 카드 ↔ 챌린지 카드)', () => {
    const stats = buildKeywordStats(reportedItems());
    const tileSum = stats.buckets.reduce((a, b) => a + b.count, 0);
    expect(String(tileSum)).toBe(String(stats.total));
  });
});

describe('동기화 시각', () => {
  const now = Date.parse('2026-08-26T00:00:00Z');

  it('한 번도 동기화 안 한 계정은 stale 이 아니라 기록 없음', () => {
    expect(isStaleSync(null, now)).toBe(false);
    expect(emptyKeywordStats().syncedAt).toBeNull();
  });

  it('72시간을 넘기면 stale', () => {
    const fresh = new Date(now - STALE_AFTER_MS + 60_000).toISOString();
    const old = new Date(now - STALE_AFTER_MS - 60_000).toISOString();
    expect(isStaleSync(fresh, now)).toBe(false);
    expect(isStaleSync(old, now)).toBe(true);
    expect(buildKeywordStats(ranks(1), { syncedAt: old, now }).isStale).toBe(true);
  });

  it('깨진 시각 문자열에 stale 을 지어내지 않는다', () => {
    expect(isStaleSync('not-a-date', now)).toBe(false);
  });
});

// ─── 선택 규칙 (참여 모집단) ───
function rankingRow(keywordId: string, rank: number, category = '도서', snapshot = '2026-08-26'): RankingRow {
  return {
    rank_position: rank,
    previous_rank: null,
    rank_change: 0,
    is_integrated_top3: rank <= 3,
    keyword_id: keywordId,
    latest_post_title: null,
    latest_post_url: null,
    snapshot_date: snapshot,
    crawled_at: `${snapshot}T01:00:00Z`,
    blog_search_rank: null,
    view_tab_rank: null,
    keyword_challenges: { keyword: keywordId, category, participant_count: 0, search_volume_monthly: 0 },
  };
}

function aliveRow(keywordId: string, category = '도서') {
  return {
    keyword_id: keywordId,
    keyword_challenges: {
      id: keywordId,
      keyword: keywordId,
      category,
      participant_count: 0,
      search_volume_monthly: 0,
    },
  };
}

describe('selectParticipation', () => {
  it('순위 스냅샷이 없는 참여 키워드는 rank=null 로 살아남는다 (총계에서 사라지지 않는다)', () => {
    const { participated } = selectParticipation({
      aliveRows: [aliveRow('a'), aliveRow('b')],
      recentRows: [rankingRow('a', 3)],
    });
    expect(participated).toHaveLength(2);
    expect(participated.find((k) => k.keyword_id === 'b')?.rank_position).toBeNull();
    expect(buildKeywordStats(participated.map((k) => ({ rank: k.rank_position }))).total).toBe(2);
  });

  it('tombstone 된 행(aliveRows 에 없음)은 어떤 버킷에도, total 에도 들어가지 않는다', () => {
    const { participated } = selectParticipation({
      aliveRows: [aliveRow('a')],   // 'gone' 은 deleted_at 이 찍혀 조회에서 빠진 상태
      recentRows: [rankingRow('a', 3)],
    });
    const stats = buildKeywordStats(participated.map((k) => ({ rank: k.rank_position })));
    expect(participated.map((k) => k.keyword_id)).toEqual(['a']);
    expect(stats.total).toBe(1);
  });

  it('키워드별 최신 스냅샷 1건만 현재 순위로 쓴다', () => {
    const { participated, ranked } = selectParticipation({
      aliveRows: [aliveRow('a')],
      recentRows: [rankingRow('a', 2, '도서', '2026-08-26'), rankingRow('a', 9, '도서', '2026-08-20')],
    });
    expect(ranked).toHaveLength(1);
    expect(participated[0].rank_position).toBe(2);
  });

  it('주제 스코프를 참여·순위 양쪽에 똑같이 적용한다 (한쪽만 걸러 총계가 벌어지지 않도록)', () => {
    const { participated, ranked } = selectParticipation({
      aliveRows: [aliveRow('a', '도서'), aliveRow('b', '경제')],
      recentRows: [rankingRow('a', 1, '도서'), rankingRow('b', 2, '경제')],
      categoryScope: '도서',
    });
    expect(participated.map((k) => k.keyword_id)).toEqual(['a']);
    expect(ranked.map((k) => k.keyword_id)).toEqual(['a']);
  });

  it('순위는 있는데 참여 행이 유실된 키워드도 참여로 인정한다 (중복 없이)', () => {
    const { participated } = selectParticipation({
      aliveRows: [aliveRow('a')],
      recentRows: [rankingRow('a', 1), rankingRow('orphan', 4)],
    });
    expect(participated.map((k) => k.keyword_id).sort()).toEqual(['a', 'orphan']);
    expect(new Set(participated.map((k) => k.keyword_id)).size).toBe(participated.length);
  });
});
