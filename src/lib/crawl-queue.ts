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

export const PRODUCTION_CRAWL_SHARDS = 2;
export const PRODUCTION_CRAWL_BATCH = 400;
// (2026-07-30) 3샤드×5분(1분 엇갈림)에서 2샤드×10분(5분 엇갈림)으로 완화.
// 개별 배치가 300~400초 넘게 걸려 5분 주기 자체가 자기 자신과도 겹치고 있었고,
// crawl_jobs 실측상 겹치는 실행이 반복돼(예: 같은 시각대 running 3건 동시) DB
// 리소스가 계속 눌려 있었다(단순 COUNT 쿼리도 초 단위로 느려짐, 2026-07-30 확인).
// 샤드 수를 줄이고 주기를 늘려 동시 파이프라인 수와 겹침 빈도를 함께 낮춘다.
// 과거 concurrency=18일 때 겹치는 구간에서 로그인(Auth) 쿼리까지 지연시킨 적
// 있어(2026-07-17, login_attempt_logs 타임아웃 56%) 6으로 낮춘 값은 유지.
export const PRODUCTION_CRAWL_CONCURRENCY = 6;
