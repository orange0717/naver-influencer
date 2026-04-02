import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('aggregate-influencers');
  const supabase = createServiceClient();

  console.log('[Cron] aggregate-influencers started at', new Date().toISOString());

  try {
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
      const promises = batch.map((s: { inf_id: string; avg_rk: number; best_rk: number; top3_cnt: number; top1_cnt: number; top2_cnt: number; top3only_cnt: number }) =>
        supabase
          .from('influencers')
          .update({
            // total_keywords는 네이버 원본 데이터 유지
            avg_rank: Number(s.avg_rk),
            best_rank: s.best_rk,
            integrated_top3_count: s.top3_cnt,
            top1_count: s.top1_cnt,
            top2_count: s.top2_cnt,
            top3_count: s.top3only_cnt,
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
  }
}
