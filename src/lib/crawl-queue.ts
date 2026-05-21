/** UI 비활성(1년)과 동일 — 일일 크롤 큐·커버리지 분모 */
export const CRAWL_CHALLENGE_RECENCY_DAYS = 365;

export function challengeRecencyCutoffIso(): string {
  return new Date(Date.now() - CRAWL_CHALLENGE_RECENCY_DAYS * 86_400_000).toISOString();
}

/** Postgrest .or() 인자: 일일 크롤 대상 */
export function dailyCrawlQueueOrFilter(): string {
  const cutoff = challengeRecencyCutoffIso();
  return `last_challenged_at.gte.${cutoff},top1_count.gt.0,top2_count.gt.0,top3_count.gt.0,last_challenged_at.is.null`;
}

export const PRODUCTION_CRAWL_SHARDS = 3;
export const PRODUCTION_CRAWL_BATCH = 650;
export const PRODUCTION_CRAWL_CONCURRENCY = 18;
