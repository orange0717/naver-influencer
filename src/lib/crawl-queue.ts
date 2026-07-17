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
export const PRODUCTION_CRAWL_BATCH = 400;
// 3개 샤드가 5분 주기로 1분씩 엇갈려 실행되며 서로 겹치는 구간이 있다.
// 동시성이 높으면(구 18, MAX_CONCURRENCY=15로 clamp) 겹치는 구간에 최대 ~45개
// 인플루언서 파이프라인이 동시에 DB에 upsert를 날려 로그인(Auth) 쿼리까지
// 지연시켰다 (2026-07-17, login_attempt_logs 타임아웃 56% 확인). 낮춰서 완화.
export const PRODUCTION_CRAWL_CONCURRENCY = 6;
