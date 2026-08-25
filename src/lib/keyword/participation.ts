import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { buildKeywordStats, type KeywordStats } from './aggregate';

/**
 * 참여 키워드 조회의 단일 경로.
 *
 * /my 대시보드(서버 렌더)와 /api/keywords/stats 가 같은 함수를 쓴다. 예전엔 화면이
 * influencer_keywords 를, 분포가 keyword_rankings 를 각자 세면서 숫자가 어긋났다.
 * 여기서 한 번만 고르고, 세는 건 aggregate.ts 가 한다.
 */

/** 순위 스냅샷을 이 기간 안에서만 '현재 순위'로 인정한다. */
export const RANK_WINDOW_DAYS = 7;

type AnySupabase = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RankingRow {
  rank_position: number;
  previous_rank: number | null;
  rank_change: number;
  is_integrated_top3: boolean;
  keyword_id: string;
  latest_post_title: string | null;
  latest_post_url: string | null;
  snapshot_date: string;
  crawled_at: string | null;
  blog_search_rank: number | null;
  view_tab_rank: number | null;
  keyword_challenges: KeywordChallengeMeta | null;
}

export interface KeywordChallengeMeta {
  keyword: string;
  category: string;
  participant_count: number;
  search_volume_monthly: number;
}

/** 순위가 확인된 키워드 1건 (기존 `rankings` 와 동일한 모양). */
export interface RankedKeyword {
  keyword_id: string;
  keyword: string;
  category: string;
  rank_position: number;
  rank_change: number;
  is_integrated_top3: boolean;
  participant_count: number;
  search_volume: number;
  latest_post_title: string;
  latest_post_url: string;
  snapshot_date: string;
  blog_search_rank: number | null;
  view_tab_rank: number | null;
}

/** 살아있는 참여 키워드 1건. rank_position 이 null 이면 '순위 없음'. */
export interface ParticipatedKeyword {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume: number;
  rank_position: number | null;
  rank_change: number;
  is_integrated_top3: boolean;
  blog_search_rank: number | null;
  view_tab_rank: number | null;
  is_participated: true;
}

export interface ParticipationSnapshot {
  /** tombstone 되지 않은 참여 키워드 전부 — 순위 없는 것 포함. 총계의 유일한 모집단. */
  participated: ParticipatedKeyword[];
  /** 그중 순위가 확인된 것만. 순위 추이·경쟁자 등 순위 기반 화면이 쓴다. */
  ranked: RankedKeyword[];
  /** 키워드별 최신 순위 원본 행 (previous_rank 등 파생 계산용). */
  latestRows: RankingRow[];
  /** 최근 RANK_WINDOW_DAYS 일의 순위 행 전체 (추이·최초 순위 계산용, 주제 필터 전). */
  recentRows: RankingRow[];
  /** keyword_rankings.crawled_at 중 최신값. */
  lastCrawledAt: string | null;
  /** 마지막 '성공' 동기화 시각. 화면의 기준 시각. */
  syncedAt: string | null;
}

/** Postgres: 컬럼 없음(42703) / 릴레이션 없음(42P01) — 마이그레이션 미실행 상태. */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === '42P01') return true;
  const m = error.message || '';
  return /does not exist|schema cache/i.test(m);
}

/**
 * "tombstone 되지 않은 참여 행만" 조회를 실행한다.
 *
 * migration-162 전에는 deleted_at 컬럼이 없어 필터를 걸면 쿼리가 통째로 실패한다.
 * 그 경우 필터 없이 한 번 더 시도해, 마이그레이션 실행 전 배포가 화면을 깨뜨리지 않게 한다
 * (그동안은 이탈 키워드가 잠시 남을 뿐, 아무것도 사라지지 않는다).
 *
 * @param run  useFilter 를 받아 쿼리를 만들어 실행하는 함수
 */
export async function runAliveParticipationQuery<T>(
  run: (useFilter: boolean) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  label: string,
): Promise<T[]> {
  const first = await run(true);
  if (!first.error) return first.data ?? [];
  if (!isMissingSchema(first.error)) {
    console.error(`[keyword/participation] ${label} 조회 실패:`, first.error.message);
    return [];
  }
  console.warn(
    `[keyword/participation] influencer_keywords.deleted_at 없음 — migration-162 미실행 (${label}). 필터 없이 조회한다.`,
  );
  const second = await run(false);
  if (second.error) console.error(`[keyword/participation] ${label} 폴백도 실패:`, second.error.message);
  return second.data ?? [];
}

/**
 * 살아있는 참여 행 조회.
 * migration-162 전에는 deleted_at 컬럼이 없으므로, 그 경우엔 필터 없이 한 번 더 시도한다.
 * (마이그레이션 실행 전 배포가 대시보드를 통째로 깨뜨리지 않도록.)
 */
async function fetchAliveParticipation(supabase: AnySupabase, influencerId: string) {
  const select = 'keyword_id, keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)';
  return runAliveParticipationQuery(
    (useFilter) => {
      const q = supabase.from('influencer_keywords').select(select).eq('influencer_id', influencerId);
      return useFilter ? q.is('deleted_at', null) : q;
    },
    'influencer_keywords',
  );
}

/** 마지막 '성공' 동기화 시각. keyword_sync_runs 가 아직 없으면 last_crawled_at 으로 폴백. */
export async function fetchSyncedAt(
  supabase: AnySupabase,
  influencerId: string,
  fallbackLastCrawledAt: string | null = null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('keyword_sync_runs')
    .select('finished_at')
    .eq('influencer_id', influencerId)
    .eq('status', 'success')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1);

  if (error) {
    if (!isMissingSchema(error)) {
      console.error('[keyword/participation] keyword_sync_runs 조회 실패:', error.message);
    }
    return fallbackLastCrawledAt;
  }
  return (data?.[0]?.finished_at as string | undefined) ?? fallbackLastCrawledAt;
}

/** 최근 RANK_WINDOW_DAYS 일의 순위 행을 키워드 메타와 함께 가져온다(사용자·기간별 캐시). */
async function fetchRecentRankingRows(
  supabase: AnySupabase,
  influencerId: string,
  sinceDate: string,
): Promise<RankingRow[]> {
  // keyword_rankings 풀스캔을 공유 캐시(Redis, 로컬 인메모리 폴백)로 완화한다.
  // 순위는 크론이 하루 단위로 갱신하므로 짧은 TTL(180s)이면 충분하다.
  // ⚠️ 빈 결과는 캐시하지 않는다 — transient timeout 으로 0건이 나와도 "순위 0"이 고착되지 않도록.
  const cacheKey = `my-rankings:${influencerId}:${sinceDate}`;
  const cached = await cacheGet<RankingRow[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  // ⚠️ keyword_challenges 임베드 조인을 넣은 단일 쿼리는 대용량 keyword_rankings 스캔과
  // 겹쳐 Postgres statement timeout 이 나고, 그때 batch 가 undefined 가 되면서 루프가 즉시
  // 끊겨 "순위 전체가 0"으로 렌더되는 버그가 있었다.
  // → 순위 행은 조인 없이 가져오고, 챌린지 메타는 keyword_id 별로 따로 조회해 매핑한다.
  type RawRankingRow = Omit<RankingRow, 'keyword_challenges'>;
  const rawRows: RawRankingRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('keyword_rankings')
      .select(`
        rank_position, previous_rank, rank_change, is_integrated_top3,
        keyword_id, latest_post_title, latest_post_url, snapshot_date, crawled_at,
        blog_search_rank, view_tab_rank
      `)
      .eq('influencer_id', influencerId)
      .gte('snapshot_date', sinceDate)
      .order('snapshot_date', { ascending: false })
      .range(from, from + PAGE - 1);
    if (!batch || batch.length === 0) break;
    rawRows.push(...(batch as unknown as RawRankingRow[]));
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const kwMap = await fetchKeywordMeta(supabase, [...new Set(rawRows.map((r) => r.keyword_id))]);
  const mapped = rawRows.map((r) => ({
    ...r,
    keyword_challenges: kwMap.get(r.keyword_id) ?? null,
  })) as RankingRow[];

  if (mapped.length > 0) await cacheSet(cacheKey, mapped, 180);
  return mapped;
}

/** .in() 은 URL 길이 한계가 있어 200개씩 나눠 조회한다. */
async function fetchKeywordMeta(
  supabase: AnySupabase,
  keywordIds: string[],
): Promise<Map<string, KeywordChallengeMeta>> {
  const map = new Map<string, KeywordChallengeMeta>();
  const CHUNK = 200;
  for (let i = 0; i < keywordIds.length; i += CHUNK) {
    const { data: kcs } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category, participant_count, search_volume_monthly')
      .in('id', keywordIds.slice(i, i + CHUNK));
    for (const kc of kcs || []) {
      map.set(kc.id as string, {
        keyword: (kc.keyword as string) || '',
        category: (kc.category as string) || '',
        participant_count: (kc.participant_count as number) || 0,
        search_volume_monthly: (kc.search_volume_monthly as number) || 0,
      });
    }
  }
  return map;
}

interface AliveRow {
  keyword_id: string;
  keyword_challenges: unknown;
}

/**
 * 순수 선택 로직 — 조회 결과 → 참여/순위 목록.
 * 테스트가 DB 없이 이 규칙을 검증할 수 있도록 쿼리와 분리했다.
 */
export function selectParticipation(input: {
  aliveRows: AliveRow[];
  recentRows: RankingRow[];
  /** 프로필 주력 주제. 비어 있지 않으면 참여·순위 양쪽에 똑같이 적용한다. */
  categoryScope?: string;
}): { participated: ParticipatedKeyword[]; ranked: RankedKeyword[]; latestRows: RankingRow[] } {
  const scope = (input.categoryScope || '').trim();

  // 키워드별 최신 1건만 남긴다 (recentRows 는 snapshot_date 내림차순).
  const seen = new Set<string>();
  let latestRows = input.recentRows.filter((r) => {
    if (seen.has(r.keyword_id)) return false;
    seen.add(r.keyword_id);
    return true;
  });

  if (scope) {
    latestRows = latestRows.filter((r) => (r.keyword_challenges?.category || '').trim() === scope);
  }

  const ranked: RankedKeyword[] = latestRows
    .map((r) => {
      const kw = r.keyword_challenges;
      return {
        keyword_id: r.keyword_id,
        keyword: kw?.keyword || '',
        category: kw?.category || '',
        rank_position: r.rank_position,
        rank_change: r.rank_change,
        is_integrated_top3: r.is_integrated_top3,
        participant_count: kw?.participant_count || 0,
        search_volume: kw?.search_volume_monthly || 0,
        latest_post_title: r.latest_post_title || '',
        latest_post_url: r.latest_post_url || '',
        snapshot_date: r.snapshot_date || '',
        blog_search_rank: r.blog_search_rank ?? null,
        view_tab_rank: r.view_tab_rank ?? null,
      };
    })
    .sort((a, b) => a.rank_position - b.rank_position);

  const rankedMap = new Map(ranked.map((r) => [r.keyword_id, r]));
  const aliveIds = new Set(input.aliveRows.map((r) => r.keyword_id));

  interface MetaWithId extends KeywordChallengeMeta { id: string }

  let participated: ParticipatedKeyword[] = input.aliveRows.map((ik) => {
    const kw = ik.keyword_challenges as unknown as MetaWithId | null;
    const r = rankedMap.get(ik.keyword_id);
    return {
      keyword_id: kw?.id || ik.keyword_id,
      keyword: kw?.keyword || '',
      category: kw?.category || '기타',
      participant_count: kw?.participant_count || 0,
      search_volume: kw?.search_volume_monthly || 0,
      rank_position: r?.rank_position ?? null,
      rank_change: r?.rank_change ?? 0,
      is_integrated_top3: r?.is_integrated_top3 ?? false,
      blog_search_rank: r?.blog_search_rank ?? null,
      view_tab_rank: r?.view_tab_rank ?? null,
      is_participated: true,
    };
  });

  // 순위는 있는데 참여 행이 없는 키워드(연결 유실)도 참여로 인정한다.
  // 순위가 있다는 건 네이버가 그 키워드에서 이 사람을 노출했다는 뜻이라 숨기면 안 된다.
  for (const r of ranked) {
    if (aliveIds.has(r.keyword_id)) continue;
    participated.push({
      keyword_id: r.keyword_id,
      keyword: r.keyword,
      category: r.category,
      participant_count: r.participant_count,
      search_volume: r.search_volume,
      rank_position: r.rank_position,
      rank_change: r.rank_change,
      is_integrated_top3: r.is_integrated_top3,
      blog_search_rank: r.blog_search_rank,
      view_tab_rank: r.view_tab_rank,
      is_participated: true,
    });
  }

  if (scope) {
    participated = participated.filter((kw) => (kw.category || '').trim() === scope);
  }

  return { participated, ranked, latestRows };
}

export function sinceDateFor(windowDays: number = RANK_WINDOW_DAYS, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - windowDays);
  return d.toISOString().slice(0, 10);
}

/** 참여 키워드 스냅샷 로드 (/my 서버 렌더와 /api/keywords/stats 공용). */
export async function loadParticipation(
  supabase: AnySupabase,
  influencerId: string,
  options: { categoryScope?: string; fallbackLastCrawledAt?: string | null } = {},
): Promise<ParticipationSnapshot> {
  const sinceDate = sinceDateFor();

  const [aliveRows, recentRows] = await Promise.all([
    fetchAliveParticipation(supabase, influencerId),
    fetchRecentRankingRows(supabase, influencerId, sinceDate),
  ]);

  const { participated, ranked, latestRows } = selectParticipation({
    aliveRows: aliveRows as unknown as AliveRow[],
    recentRows,
    categoryScope: options.categoryScope,
  });

  const lastCrawledAt = recentRows.reduce<string | null>((max, r) => {
    const c = r.crawled_at;
    if (!c) return max;
    return !max || c > max ? c : max;
  }, null);

  const syncedAt = await fetchSyncedAt(
    supabase,
    influencerId,
    options.fallbackLastCrawledAt ?? lastCrawledAt,
  );

  return { participated, ranked, latestRows, recentRows, lastCrawledAt, syncedAt };
}

/** 스냅샷 → 화면·API가 그대로 쓰는 집계. 총계는 언제나 버킷 합이다. */
export function statsFromSnapshot(snapshot: ParticipationSnapshot, now?: number): KeywordStats {
  return buildKeywordStats(
    snapshot.participated.map((k) => ({ rank: k.rank_position })),
    { syncedAt: snapshot.syncedAt, now },
  );
}
