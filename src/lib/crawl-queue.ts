import type { createServiceClient } from '@/lib/supabase-server';

/** UI 비활성(1년)과 동일 — 일일 크롤 큐·커버리지 분모 */
export const CRAWL_CHALLENGE_RECENCY_DAYS = 365;

export function challengeRecencyCutoffIso(): string {
  return new Date(Date.now() - CRAWL_CHALLENGE_RECENCY_DAYS * 86_400_000).toISOString();
}

type InfluencerQuery = ReturnType<ReturnType<typeof createServiceClient>['from']>;

/** 일일 챌린지 순위 크롤 대상 (활성·수동중단 제외·최근 활동 또는 미수집) */
export function applyDailyCrawlQueueFilters<Q extends InfluencerQuery>(query: Q): Q {
  const cutoff = challengeRecencyCutoffIso();
  return query
    .eq('is_active', true)
    .neq('stopped_manual', true)
    .or(
      `last_challenged_at.gte.${cutoff},top1_count.gt.0,top2_count.gt.0,top3_count.gt.0,last_challenged_at.is.null`,
    ) as Q;
}

/** 1년 이상 챌린지·TOP3 없음 → is_active=false 로 큐·분모 축소 */
export function applyLongInactiveDeactivateFilters<Q extends InfluencerQuery>(query: Q): Q {
  const cutoff = challengeRecencyCutoffIso();
  return query
    .eq('is_active', true)
    .neq('stopped_manual', true)
    .not('last_challenged_at', 'is', null)
    .lt('last_challenged_at', cutoff)
    .eq('top1_count', 0)
    .eq('top2_count', 0)
    .eq('top3_count', 0) as Q;
}

export const PRODUCTION_CRAWL_SHARDS = 3;
export const PRODUCTION_CRAWL_BATCH = 650;
export const PRODUCTION_CRAWL_CONCURRENCY = 18;
