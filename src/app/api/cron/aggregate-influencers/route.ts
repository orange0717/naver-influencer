import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  createCrawlJob,
  releaseCronLock,
  tryAcquireCronLock,
  updateCrawlJob,
  verifyCronSecret,
} from '@/lib/crawler';

// 전체 집계는 DB RPC 안에서 처리하되, 인플루언서를 배치로 나눠 여러 번의 짧은
// RPC 호출로 수행한다 (2026-07-11 수정, 같은 날 라이브 테스트로 2차 수정).
//
// 배경: 인플루언서 전체(1.3만+명)를 한 번에 집계하는 단일 RPC 방식이었을 때,
// 주 경로(refresh_influencer_aggregate_stats)와 폴백(aggregate_influencer_stats)
// 둘 다 Supabase REST 게이트웨이의 HTTP 타임아웃(~120초)을 개별적으로 초과해
// 2026-05-25부터 매일 "upstream request timeout"으로 실패 → keyword_score/
// ninfl_rank/avg_rank/best_rank가 7주 가까이 갱신되지 않는 사고로 이어졌다.
// (statement_timeout을 늘려도 소용없음 — DB 실행시간이 아니라 게이트웨이의
//  HTTP 요청 타임아웃이라 우회 불가능했음.)
//
// migration-106-aggregate-stats-batched.sql 에서 배치 버전 RPC 3종을 추가:
//   - refresh_influencer_aggregate_stats_batch(ids) : 배치 단위 UPDATE(ninfl_rank 제외)
//   - aggregate_influencer_stats_batch(ids)         : 배치 단위 원시 집계(위 RPC 실패 시 폴백)
//   - recompute_ninfl_ranks()                       : 전역 순위 재계산(모든 배치 후 1회)
//
// 라이브 테스트에서 추가로 발견된 2가지 문제와 대응 (migration-107):
//   1) 인플루언서당 keyword_rankings 참여 건수 편차가 매우 커서(수십~2,000+),
//      300명 단위 배치도 쿼리 플래너가 비효율 실행계획으로 전환되며 90초
//      statement_timeout에 걸리는 사례를 실측함(0~300번 300명 묶음은 실패,
//      0~200/200~300으로 쪼개면 각각 정상). → BATCH_SIZE를 80으로 낮추고,
//      그래도 타임아웃 나는 배치는 재귀적으로 반씩 쪼개 재시도(processBatchWithRetry).
//   2) 기존 코드는 시간 예산 초과 시 "다음 실행에서 이어감"이라 주석에 썼지만
//      실제로는 매 실행마다 id 오름차순 전체를 처음부터 다시 돌아, 뒤쪽 id의
//      인플루언서는 영원히 갱신되지 않는 구조적 결함이 있었음. → cron_cursors
//      테이블에 마지막 처리 지점을 저장해 다음 실행이 그 지점부터 이어가고,
//      전체를 한 바퀴 다 돌면 커서를 리셋해 처음부터 순환하도록 수정.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CRON_LOCK_KEY = 'cron:aggregate-influencers';
const CRON_LOCK_TTL_SECONDS = 660;
const CURSOR_KEY = 'aggregate-influencers';

// 배치당 인플루언서 수. 실측 결과 300명 단위는 (편차가 큰 데이터가 섞이면) 쿼리
// 플래너가 비효율 계획으로 전환되어 90초 statement_timeout에 걸리는 사례가 있었음.
// 80명은 여유 있게 안전한 구간(실측 100명 UPDATE 포함 ~19초, 200명 SELECT만 ~15초).
const BATCH_SIZE = 80;
// 타임아웃성 오류가 나는 배치는 이 크기까지 재귀적으로 반씩 쪼개서 재시도한다.
const MIN_SPLIT_SIZE = 10;
// Vercel maxDuration(300초)에 근접하면 남은 배치는 다음 실행으로 미루고 안전하게 종료.
const TIME_BUDGET_MS = 270_000;

type AggregateBatchResult = { updated?: number };
type AggregateStatsRow = {
  inf_id: string;
  avg_rk: number;
  best_rk: number;
  calc_ninfl_score: number;
};
type SupabaseClient = ReturnType<typeof createServiceClient>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isTimeoutLikeError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('57014') || m.includes('timeout') || m.includes('canceling statement');
}

async function getCursor(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('cron_cursors')
    .select('cursor_value')
    .eq('key', CURSOR_KEY)
    .maybeSingle();
  if (error) {
    // cron_cursors 테이블이 아직 없거나(migration-107 미적용) 조회 실패해도
    // 처음부터 처리하는 것으로 안전하게 폴백 — 크론 자체를 막지 않는다.
    console.warn('[aggregate-influencers] 커서 조회 실패, 처음부터 진행:', error.message);
    return null;
  }
  return (data?.cursor_value as string | null) ?? null;
}

async function setCursor(supabase: SupabaseClient, value: string | null) {
  const { error } = await supabase
    .from('cron_cursors')
    .upsert({ key: CURSOR_KEY, cursor_value: value, updated_at: new Date().toISOString() });
  if (error) {
    console.warn('[aggregate-influencers] 커서 저장 실패:', error.message);
  }
}

/** JS 폴백: 원시 집계 RPC + 개별 UPDATE */
async function fallbackJsUpdate(
  supabase: SupabaseClient,
  batch: string[],
): Promise<{ updated: number; failed: number }> {
  const { data: stats, error: rpcErr } = await supabase.rpc('aggregate_influencer_stats_batch', {
    p_influencer_ids: batch,
  });

  if (rpcErr) {
    console.error(`[aggregate-influencers] 폴백 RPC도 실패 (batch size=${batch.length}):`, rpcErr.message);
    return { updated: 0, failed: batch.length };
  }

  const rows = (stats || []) as AggregateStatsRow[];
  const results = await Promise.all(
    rows.map((s) =>
      supabase
        .from('influencers')
        .update({
          avg_rank: Number(s.avg_rk),
          best_rank: s.best_rk,
          keyword_score: s.calc_ninfl_score || 0,
        })
        .eq('id', s.inf_id)
        .then(({ error }) => !error),
    ),
  );
  const updated = results.filter(Boolean).length;
  return { updated, failed: results.length - updated };
}

/**
 * 배치 단위 DB UPDATE RPC 호출. 타임아웃성 오류면 배치를 반으로 쪼개 재귀 재시도하고,
 * MIN_SPLIT_SIZE 이하로 줄었는데도 실패하면 JS 폴백(원시 집계 + 개별 UPDATE)으로 전환한다.
 * 타임아웃이 아닌 다른 오류(RPC 미존재 등)는 쪼개봐야 소용없으므로 바로 폴백한다.
 */
async function processBatchWithRetry(
  supabase: SupabaseClient,
  batch: string[],
  batchLabel: string,
): Promise<{ updated: number; failed: number }> {
  const started = Date.now();
  const { data: refreshed, error: refreshErr } = await supabase.rpc(
    'refresh_influencer_aggregate_stats_batch',
    { p_influencer_ids: batch },
  );

  if (!refreshErr) {
    const result = (refreshed || {}) as AggregateBatchResult;
    console.log(`[aggregate-influencers] ${batchLabel} db-refresh 완료 (${Date.now() - started}ms, size=${batch.length}, updated=${result.updated || 0})`);
    return { updated: Number(result.updated || 0), failed: 0 };
  }

  if (isTimeoutLikeError(refreshErr.message) && batch.length > MIN_SPLIT_SIZE) {
    console.warn(`[aggregate-influencers] ${batchLabel} 타임아웃성 실패(size=${batch.length}), 절반으로 쪼개 재시도:`, refreshErr.message);
    const mid = Math.floor(batch.length / 2);
    const [left, right] = await Promise.all([
      processBatchWithRetry(supabase, batch.slice(0, mid), `${batchLabel}-L`),
      processBatchWithRetry(supabase, batch.slice(mid), `${batchLabel}-R`),
    ]);
    return { updated: left.updated + right.updated, failed: left.failed + right.failed };
  }

  console.warn(`[aggregate-influencers] ${batchLabel} db-refresh 실패, JS 폴백 시도 (size=${batch.length}):`, refreshErr.message);
  const fb = await fallbackJsUpdate(supabase, batch);
  console.log(`[aggregate-influencers] ${batchLabel} JS 폴백 완료 (${Date.now() - started}ms, updated=${fb.updated}, failed=${fb.failed})`);
  return fb;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    console.log('[aggregate-influencers] Previous run is still active; skipping');
    return NextResponse.json({ success: true, skipped: true, reason: 'lock_active' });
  }

  const jobId = await createCrawlJob('aggregate-influencers');
  const supabase = createServiceClient();
  const startedAt = Date.now();

  console.log('[Cron] aggregate-influencers started at', new Date().toISOString());

  try {
    // 전체 인플루언서 id 목록 (PK 기준 페이지네이션 — .limit() 절단 방지 패턴)
    const allIds: string[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error } = await supabase
        .from('influencers')
        .select('id')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`influencer id 목록 조회 실패: ${error.message}`);
      if (!page || page.length === 0) break;
      allIds.push(...page.map((r) => r.id as string));
      if (page.length < PAGE) break;
    }

    // 커서: 지난 실행에서 마지막으로 처리 시도한 id. 그 다음부터 이어서 처리하고,
    // 전체를 한 바퀴 다 돌면 커서를 리셋해 처음부터 순환한다.
    const cursor = await getCursor(supabase);
    let startIndex = 0;
    if (cursor) {
      const idx = allIds.findIndex((id) => id > cursor);
      startIndex = idx === -1 ? 0 : idx; // 커서가 마지막 id였으면 한 바퀴 완료 → 처음부터
    }
    const idsToProcess = allIds.slice(startIndex);

    const batches = chunk(idsToProcess, BATCH_SIZE);
    console.log(`[aggregate-influencers] 전체 ${allIds.length}명, 이번 실행 대상 ${idsToProcess.length}명(커서=${cursor ?? '없음(처음부터)'}), ${batches.length}개 배치`);

    let processed = 0;
    let failed = 0;
    let timedOut = false;
    let lastAttemptedId: string | null = null;
    let completedFullCycle = false;

    for (let i = 0; i < batches.length; i++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        timedOut = true;
        console.warn(`[aggregate-influencers] 시간 예산 초과 — ${i}/${batches.length} 배치까지만 처리, 나머지는 다음 실행에서 이어감`);
        break;
      }

      const batch = batches[i];
      const result = await processBatchWithRetry(supabase, batch, `batch ${i + 1}/${batches.length}`);
      processed += result.updated;
      failed += result.failed;
      lastAttemptedId = batch[batch.length - 1];

      if (i === batches.length - 1) completedFullCycle = true;
    }

    // 커서 갱신: 끝까지 다 돌았으면 리셋(다음 실행은 처음부터), 중간에 멈췄으면
    // 마지막으로 시도한 id를 저장해 다음 실행이 그 다음부터 이어가도록 한다.
    await setCursor(supabase, completedFullCycle ? null : lastAttemptedId);

    // 전역 순위(ninfl_rank)는 모든 배치의 keyword_score가 반영된 뒤 마지막에 1회만 재계산.
    // (부분 처리로 끝났어도 지금까지 반영된 점수 기준으로는 재계산해두는 편이 더 정확함)
    let ranked = 0;
    const { data: rankResult, error: rankErr } = await supabase.rpc('recompute_ninfl_ranks');
    if (rankErr) {
      console.error('[aggregate-influencers] recompute_ninfl_ranks 실패:', rankErr.message);
    } else {
      ranked = Number((rankResult as { ranked?: number } | null)?.ranked || 0);
    }

    // 배치 일부 실패나 시간 예산 초과가 있어도 나머지 배치는 정상 반영됐으므로
    // job 상태는 'success' 유지 — 실패/미처리 건수는 failed_items·응답 로그로 확인.
    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: idsToProcess.length,
      processed_items: processed,
      failed_items: failed,
    });

    console.log(`[Cron] aggregate-influencers done: ${processed}/${idsToProcess.length} updated, ${failed} failed, ranked=${ranked}${timedOut ? ' (시간 예산 초과로 일부만 처리, 커서 저장함)' : completedFullCycle ? ' (전체 한 바퀴 완료, 커서 리셋)' : ''}`);

    return NextResponse.json({
      success: true,
      totalInfluencers: allIds.length,
      targetedThisRun: idsToProcess.length,
      batches: batches.length,
      processed,
      failed,
      ranked,
      timedOut,
      completedFullCycle,
      cursor: completedFullCycle ? null : lastAttemptedId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    console.error('[aggregate-influencers] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
