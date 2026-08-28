/**
 * topics 테이블 조회 시 "마이그레이션 파일은 커밋됐는데 DB엔 안 들어간" 상태를 견디기 위한 공용 유틸.
 *
 * PostgREST 는 없는 컬럼을 select(또는 order)하면 42703 으로 쿼리 **전체**를 실패시킨다.
 * 그래서 컬럼 하나가 없으면 토픽 목록이 통째로 빈 배열이 되고, 화면은 그걸
 * "아직 분류된 토픽이 없습니다"로 그린다 — 오류가 '데이터 없음'으로 둔갑한다.
 * (2026-08-28 실제로 migration-132 전체가 미적용이라 이 경로로 조용히 죽어 있었다.)
 *
 * 따라서 조회는 컬럼을 단계적으로 줄여가며 재시도하고, 어느 단계까지 내려왔는지를
 * 호출부에 알려준다. 호출부는 그 단계에 따라 "0"이 아니라 "-"(미측정)로 표시해야 한다.
 */

/** 어떤 마이그레이션과도 무관하게 처음부터 있던 컬럼들 */
export const TOPIC_CORE_COLUMNS =
  'id, user_id, blog_id, topic_type, name, description, representative_keywords, post_count, total_view_count, last_post_at';

/** migration-132-topic-performance.sql 이 추가하는 성과 지표 컬럼들 */
export const TOPIC_PERFORMANCE_COLUMNS =
  'avg_integrated_rank, avg_blog_rank, ai_briefing_count, ai_tab_count, challenge_top3_count, new_posts_30d, is_representative, representative_score';

/** migration-161-topic-ai-checked-count.sql 이 추가하는 컬럼 */
export const TOPIC_AI_CHECKED_COLUMN = 'ai_checked_count';

/**
 * - `full`         : 132 + 161 모두 적용됨
 * - `no_ai_checked`: 132 만 적용됨 → AI 확인 건수는 '미확인'으로 취급
 * - `core_only`    : 132 미적용 → 성과 지표 전부 '미측정'으로 취급
 */
export type TopicColumnTier = 'full' | 'no_ai_checked' | 'core_only';

const TIER_ORDER: TopicColumnTier[] = ['full', 'no_ai_checked', 'core_only'];

type PgError = { code?: string; message?: string } | null;

/** PostgREST: 존재하지 않는 컬럼 */
export function isUndefinedColumn(error: PgError): boolean {
  return error?.code === '42703';
}

/** 해당 단계에서 select 할 컬럼 목록. `core` 는 호출부마다 필요한 만큼만 넘긴다. */
export function topicColumnsFor(tier: TopicColumnTier, core: string): string {
  if (tier === 'core_only') return core;
  if (tier === 'no_ai_checked') return `${core}, ${TOPIC_PERFORMANCE_COLUMNS}`;
  return `${core}, ${TOPIC_PERFORMANCE_COLUMNS}, ${TOPIC_AI_CHECKED_COLUMN}`;
}

/**
 * 컬럼을 단계적으로 줄여가며 재시도한다.
 * `run` 은 select 뿐 아니라 order 절도 tier 에 맞춰 조정해야 한다 —
 * `order('is_representative')` 역시 컬럼이 없으면 같은 42703 으로 죽는다.
 */
export async function queryTopicsWithFallback<T>(
  core: string,
  run: (columns: string, tier: TopicColumnTier) => Promise<{ data: T | null; error: PgError }>,
): Promise<{ data: T | null; error: PgError; tier: TopicColumnTier }> {
  let last: { data: T | null; error: PgError } = { data: null, error: null };
  for (const tier of TIER_ORDER) {
    last = await run(topicColumnsFor(tier, core), tier);
    if (!isUndefinedColumn(last.error)) return { ...last, tier };
  }
  return { ...last, tier: 'core_only' };
}

/**
 * 화면이 구분해야 하는 세 가지 상태.
 * `error` 를 `ok` + 빈 배열로 뭉개면 사용자는 "내 토픽이 없구나"로 읽는다.
 */
export type TopicSectionStatus = 'ok' | 'degraded' | 'error';

export function topicSectionStatus(error: PgError, tier: TopicColumnTier): TopicSectionStatus {
  if (error) return 'error';
  return tier === 'core_only' ? 'degraded' : 'ok';
}
