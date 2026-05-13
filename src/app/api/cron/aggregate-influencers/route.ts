import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  createCrawlJob,
  releaseCronLock,
  tryAcquireCronLock,
  updateCrawlJob,
  verifyCronSecret,
} from '@/lib/crawler';

// 전체 집계는 DB RPC 안에서 한 번에 처리한다. RPC 미적용 환경은 기존 JS 배치로 폴백.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CRON_LOCK_KEY = 'cron:aggregate-influencers';
const CRON_LOCK_TTL_SECONDS = 660;

type AggregateRefreshResult = {
  updated?: number;
  ranked?: number;
};

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

  console.log('[Cron] aggregate-influencers started at', new Date().toISOString());

  try {
    const { data: refreshed, error: refreshErr } = await supabase.rpc('refresh_influencer_aggregate_stats');
    if (!refreshErr) {
      const result = (refreshed || {}) as AggregateRefreshResult;
      const processed = Number(result.updated || 0);

      await updateCrawlJob(jobId, {
        status: 'success',
        total_items: processed,
        processed_items: processed,
        failed_items: 0,
      });

      console.log(`[Cron] aggregate-influencers DB refresh done: ${processed} updated, ${result.ranked || 0} ranked`);

      return NextResponse.json({
        success: true,
        mode: 'db-refresh',
        processed,
        ranked: result.ranked || 0,
        timestamp: new Date().toISOString(),
      });
    }

    console.warn('[aggregate-influencers] DB refresh RPC unavailable, falling back to JS batch:', refreshErr.message);

    // DB에서 직접 집계 (RPC) — 30일 기준, 키워드당 최신 스냅샷
    const { data: stats, error: rpcErr } = await supabase.rpc('aggregate_influencer_stats');

    if (rpcErr) throw new Error(rpcErr.message);

    if (!stats || stats.length === 0) {
      console.log('[aggregate-influencers] No ranking data found');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    console.log(`[aggregate-influencers] ${stats.length}명 인플루언서 집계 완료`);

    // 배치 업데이트 (500개씩 병렬 처리)
    let processed = 0;
    let failed = 0;
    const BATCH = 500;

    for (let i = 0; i < stats.length; i += BATCH) {
      const batch = stats.slice(i, i + BATCH);
      const promises = batch.map((s: { inf_id: string; avg_rk: number; best_rk: number; calc_ninfl_score: number }) =>
        supabase
          .from('influencers')
          .update({
            // avg_rank, best_rank, keyword_score만 스냅샷 기반 업데이트
            // TOP3 카운트(top1/2/3_count, integrated_top3_count)는
            // crawl-challenge-ranks가 네이버 공식 API에서 직접 설정하므로 덮어쓰지 않음
            avg_rank: Number(s.avg_rk),
            best_rank: s.best_rk,
            keyword_score: s.calc_ninfl_score || 0,
          })
          .eq('id', s.inf_id)
          .then(({ error }) => {
            if (error) {
              console.error(`[aggregate-influencers] Update error for ${s.inf_id}:`, error.message);
              failed++;
            } else {
              processed++;
            }
          }),
      );
      await Promise.all(promises);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: stats.length,
      processed_items: processed,
      failed_items: failed,
    });

    console.log(`[Cron] aggregate-influencers done: ${processed}/${stats.length} updated`);

    return NextResponse.json({
      success: true,
      total: stats.length,
      processed,
      failed,
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
