import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 참여 키워드 동기화의 마무리 단계 — 네이버 목록과 DB를 일치시킨다.
 *
 * 숫자가 벌어지는 근본 원인은 동기화가 upsert 만 하고 사라진 것을 지우지 않는 것이었다.
 * 챌린지가 끝났거나 이탈한 키워드가 influencer_keywords 에 영구히 남아 총계만 부풀었다.
 *
 * 규칙:
 *  - 목록을 **끝까지** 받아온 실행만 tombstone 단계로 넘어간다.
 *    수집이 부분 실패(타임아웃·차단·상한)했는데 삭제로 오인하면 다음 화면에서 키워드가 대량 증발한다.
 *  - 물리 삭제(DELETE)를 쓰지 않는다. deleted_at 만 찍는다.
 *  - 다시 참여한 키워드는 deleted_at 을 NULL 로 되돌린다.
 */

type AnySupabase = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SyncStatus = 'success' | 'partial' | 'failed';

export interface ReconcileParams {
  supabase: AnySupabase;
  influencerId: string;
  source: 'manual' | 'cron';
  /** 이번 실행에서 확인된 keyword_challenges.id 목록 (네이버 현재 참여 목록). */
  currentKeywordIds: string[];
  /** 네이버 목록을 끝까지 받아왔는가. false 면 tombstone 을 건너뛴다. */
  complete: boolean;
  /** 네이버 API가 받아온 항목 수. */
  fetchedCount: number;
  /** 네이버 paging.total — 원본 「전체 키워드」. */
  reportedTotal: number | null;
  startedAt: string;
}

export interface ReconcileResult {
  status: SyncStatus;
  tombstoned: number;
  restored: number;
  aliveTotal: number;
  /** 네이버 원본 총계와 우리 살아있는 참여 수가 어긋났는지. */
  mismatch: boolean;
}

/** Postgres: 컬럼 없음(42703) / 릴레이션 없음(42P01) — migration-162 미실행. */
function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === '42P01') return true;
  return /does not exist|schema cache/i.test(error.message || '');
}

const CHUNK = 200;

export async function reconcileParticipation(params: ReconcileParams): Promise<ReconcileResult> {
  const { supabase, influencerId, currentKeywordIds, complete } = params;
  const currentSet = new Set(currentKeywordIds);
  const status: SyncStatus = complete ? 'success' : 'partial';

  let tombstoned = 0;
  let restored = 0;
  let aliveTotal = currentSet.size;
  let schemaReady = true;

  // ─── 1. 현재 참여 행 한 번에 읽기 ───
  // 크론이 인플루언서마다 도는 경로라 쿼리 수를 늘리지 않는다.
  // 살아있는 행/지워진 행을 따로 묻지 않고 한 번 훑어 로컬에서 가른다.
  const { data: rows, error: rowsErr } = await supabase
    .from('influencer_keywords')
    .select('keyword_id, deleted_at')
    .eq('influencer_id', influencerId);

  if (isMissingSchema(rowsErr)) {
    schemaReady = false;
    console.warn(
      '[keyword/sync-reconcile] influencer_keywords.deleted_at 없음 — migration-162 미실행. ' +
        'tombstone 을 건너뛴다(총계가 계속 부풀 수 있음).',
    );
  } else if (rowsErr) {
    console.error('[keyword/sync-reconcile] 참여 행 조회 실패:', rowsErr.message);
    schemaReady = false;
  }

  const existing = schemaReady
    ? (rows || []).map((r) => ({ id: r.keyword_id as string, deleted: r.deleted_at != null }))
    : [];

  // ─── 2. 다시 참여한 키워드 되살리기 ───
  // upsert(ignoreDuplicates) 는 기존 행을 건드리지 않으므로 deleted_at 이 그대로 남는다.
  // 지워진 행은 보통 소수라, 그중 이번 목록에 다시 나타난 것만 골라 되돌린다.
  if (schemaReady) {
    const toRestore = existing.filter((r) => r.deleted && currentSet.has(r.id)).map((r) => r.id);
    for (let i = 0; i < toRestore.length; i += CHUNK) {
      const slice = toRestore.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('influencer_keywords')
        .update({ deleted_at: null })
        .eq('influencer_id', influencerId)
        .in('keyword_id', slice);
      if (error) console.error('[keyword/sync-reconcile] 복구 실패:', error.message);
      else restored += slice.length;
    }
  }

  // ─── 2-1. 사라진 키워드 tombstone ───
  // 목록을 끝까지 받아온 실행에서만. 부분 수집을 삭제로 오인하지 않는다.
  // 목록이 통째로 비어 돌아온 경우도 건너뛴다 — "정말 0개 참여"와 "빈 응답"을
  // 구분할 방법이 없는데, 오판하면 사용자의 참여 이력 전체가 한 번에 사라진다.
  const emptyList = complete && currentSet.size === 0;
  if (emptyList) {
    console.warn(
      `[keyword/sync-reconcile] ${influencerId}: 참여 목록이 0개로 돌아옴 — tombstone 건너뜀.`,
    );
  }
  if (schemaReady && complete && !emptyList) {
    const alive = existing.filter((r) => !r.deleted).map((r) => r.id);
    const gone = alive.filter((id) => !currentSet.has(id));
    const now = new Date().toISOString();
    for (let i = 0; i < gone.length; i += CHUNK) {
      const slice = gone.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('influencer_keywords')
        .update({ deleted_at: now })
        .eq('influencer_id', influencerId)
        .in('keyword_id', slice);
      if (error) console.error('[keyword/sync-reconcile] tombstone 실패:', error.message);
      else tombstoned += slice.length;
    }
    aliveTotal = alive.length - tombstoned + restored;
  }

  // ─── 3. 실행 기록 + 정합성 경고 ───
  // 이번 같은 사고를 조용히 넘기지 않기 위한 장치.
  const mismatch =
    complete && params.reportedTotal != null && params.reportedTotal !== params.fetchedCount;
  if (mismatch) {
    console.warn(
      `[keyword/sync-reconcile] ${influencerId}: 네이버 전체 ${params.reportedTotal}개 vs ` +
        `수집 ${params.fetchedCount}개 불일치 — 화면 총계가 원본과 어긋날 수 있다.`,
    );
  }

  const { error: runErr } = await supabase.from('keyword_sync_runs').insert({
    influencer_id: influencerId,
    source: params.source,
    started_at: params.startedAt,
    finished_at: new Date().toISOString(),
    status,
    fetched_count: params.fetchedCount,
    reported_total: params.reportedTotal,
    linked_count: currentSet.size,
    tombstoned,
    restored,
    note: emptyList
      ? 'empty list — tombstone skipped'
      : mismatch
        ? 'reported_total != fetched_count'
        : null,
  });
  if (runErr && !isMissingSchema(runErr)) {
    console.error('[keyword/sync-reconcile] 실행 기록 실패:', runErr.message);
  }

  return { status, tombstoned, restored, aliveTotal, mismatch };
}

/** 실패(목록을 전혀 못 받음)한 실행도 기록해 둔다 — '기준 시각'에는 쓰이지 않는다. */
export async function recordFailedSync(
  supabase: AnySupabase,
  influencerId: string,
  source: 'manual' | 'cron',
  startedAt: string,
  note?: string,
): Promise<void> {
  const { error } = await supabase.from('keyword_sync_runs').insert({
    influencer_id: influencerId,
    source,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: 'failed',
    fetched_count: 0,
    linked_count: 0,
    note: note ?? null,
  });
  if (error && !isMissingSchema(error)) {
    console.error('[keyword/sync-reconcile] 실패 기록 실패:', error.message);
  }
}
