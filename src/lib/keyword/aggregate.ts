/**
 * 키워드 챌린지 수치의 단일 집계 소스.
 *
 * 화면·API·배치가 전부 이 파일에서만 숫자를 만든다. 버킷 경계값과 라벨도 여기서만
 * 정의한다 — 컴포넌트가 자기 나름의 `rank <= 3` 을 들고 있으면 조건이 두 곳이 되고,
 * 그 순간 이번 버그(참여 586 vs 분포 합 572)가 그대로 재발한다.
 *
 * 불변식 두 줄:
 *   참여 키워드 = Σ(모든 순위 버킷)
 *   Σ(모든 순위 버킷) = 네이버 「전체 키워드」 (동기화 시점 기준)
 *
 * 첫 줄은 이 파일이 구조적으로 보장한다(total 은 buckets 를 더해서만 만든다).
 * 둘째 줄은 동기화의 tombstone 이 보장한다 — migration-162 참고.
 */

/** 순위 버킷 식별자. 'unranked' 는 순위가 확인되지 않은 상태(≠ 순위가 낮음). */
export type BucketId =
  | 'r1' | 'r2' | 'r3' | 'r4' | 'r5'
  | 'r6_10' | 'r11_20' | 'r21_30' | 'r30plus'
  | 'unranked';

export interface BucketDef {
  id: BucketId;
  label: string;
  /** 포함 범위(양끝 포함). unranked 는 순위 없음이라 범위가 없다. */
  min: number;
  max: number;
}

/**
 * 순위가 있는 버킷 — count 가 0이어도 항상 이 순서 그대로 노출한다.
 * (0인 구간을 숨기면 화면 레이아웃이 사용자마다 흔들린다.)
 */
export const RANK_BUCKETS: readonly BucketDef[] = [
  { id: 'r1', label: '1위', min: 1, max: 1 },
  { id: 'r2', label: '2위', min: 2, max: 2 },
  { id: 'r3', label: '3위', min: 3, max: 3 },
  { id: 'r4', label: '4위', min: 4, max: 4 },
  { id: 'r5', label: '5위', min: 5, max: 5 },
  { id: 'r6_10', label: '6-10위', min: 6, max: 10 },
  { id: 'r11_20', label: '11-20위', min: 11, max: 20 },
  { id: 'r21_30', label: '21-30위', min: 21, max: 30 },
  { id: 'r30plus', label: '30위+', min: 31, max: Number.POSITIVE_INFINITY },
] as const;

/**
 * 순위가 확인되지 않은 참여 키워드.
 * count > 0 일 때만 배열 끝에 붙는다. 30위+ 에 합치지 않는다 —
 * 순위가 낮은 것과 순위가 없는 것은 다른 상태다.
 */
export const UNRANKED_BUCKET: BucketDef = {
  id: 'unranked',
  label: '순위 없음',
  min: Number.NaN,
  max: Number.NaN,
};

export const UNRANKED_TOOLTIP = '아직 순위가 확인되지 않은 키워드입니다.';

/** TOP 3 / TOP 10 을 이루는 버킷. SQL 조건이 아니라 버킷 조합으로만 정의한다. */
export const TOP3_BUCKETS: readonly BucketId[] = ['r1', 'r2', 'r3'];
export const TOP10_BUCKETS: readonly BucketId[] = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6_10'];

/** 이 시간을 넘기면 화면에 "동기화가 오래됐어요"를 띄운다. */
export const STALE_AFTER_MS = 72 * 60 * 60 * 1000;

export interface KeywordBucket {
  id: BucketId;
  label: string;
  count: number;
}

export interface KeywordStats {
  /** 참여 키워드 총계. 반드시 buckets 의 합 — 별도 COUNT(*) 로 구하지 않는다. */
  total: number;
  top3: number;
  top10: number;
  /** 순위 버킷 9개는 항상 같은 순서로, unranked 는 count > 0 일 때만 끝에. */
  buckets: KeywordBucket[];
  /** 마지막 '성공' 동기화 시각(ISO8601). 한 번도 동기화하지 않았으면 null. */
  syncedAt: string | null;
  isStale: boolean;
}

/** 집계 입력 1건 — 살아있는(tombstone 되지 않은) 참여 키워드 하나. */
export interface KeywordStatsInput {
  /** 확인된 순위. 미수집·미노출(네이버 rank=0)은 null 로 넣는다. */
  rank: number | null | undefined;
}

/**
 * 순위 하나가 속할 버킷.
 * null·0·음수·NaN 은 전부 '순위 없음'이다 — 네이버는 미노출 키워드를 rank=0 으로 준다.
 */
export function bucketIdForRank(rank: number | null | undefined): BucketId {
  if (rank == null || !Number.isFinite(rank) || rank < 1) return 'unranked';
  const hit = RANK_BUCKETS.find((b) => rank >= b.min && rank <= b.max);
  return hit ? hit.id : 'r30plus';
}

/** 버킷 배열에서 특정 버킷들의 합. total·top3·top10 이 전부 이 함수를 지난다. */
export function sumBuckets(buckets: readonly KeywordBucket[], ids: readonly BucketId[]): number {
  const wanted = new Set<BucketId>(ids);
  return buckets.reduce((sum, b) => (wanted.has(b.id) ? sum + b.count : sum), 0);
}

export function isStaleSync(syncedAt: string | null, now: number = Date.now()): boolean {
  if (!syncedAt) return false; // 한 번도 동기화 안 함 = '오래됨'이 아니라 '없음'
  const t = new Date(syncedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > STALE_AFTER_MS;
}

/**
 * 참여 키워드 목록 → 화면·API가 그대로 쓰는 집계.
 * total 은 buckets 를 더해서만 만든다. 이게 이번 버그의 재발 방지선이다.
 */
export function buildKeywordStats(
  items: readonly KeywordStatsInput[],
  options: { syncedAt?: string | null; now?: number } = {},
): KeywordStats {
  const counts = new Map<BucketId, number>();
  for (const item of items) {
    const id = bucketIdForRank(item.rank);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const buckets: KeywordBucket[] = RANK_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    count: counts.get(b.id) ?? 0,
  }));

  const unranked = counts.get('unranked') ?? 0;
  if (unranked > 0) {
    buckets.push({ id: UNRANKED_BUCKET.id, label: UNRANKED_BUCKET.label, count: unranked });
  }

  const syncedAt = options.syncedAt ?? null;
  return {
    total: buckets.reduce((sum, b) => sum + b.count, 0),
    top3: sumBuckets(buckets, TOP3_BUCKETS),
    top10: sumBuckets(buckets, TOP10_BUCKETS),
    buckets,
    syncedAt,
    isStale: isStaleSync(syncedAt, options.now),
  };
}

/** 아직 한 번도 동기화하지 않은 사용자용 빈 집계 (404·204 대신 이걸 준다). */
export function emptyKeywordStats(): KeywordStats {
  return buildKeywordStats([], { syncedAt: null });
}
