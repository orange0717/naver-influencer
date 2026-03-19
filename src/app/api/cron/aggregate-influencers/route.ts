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
    // 최근 7일 이내 snapshot 기준으로 집계
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

    // RPC 호출 시도 → 실패 시 직접 쿼리 폴백
    let stats: { influencer_id: string; total_keywords: number; avg_rank: number; best_rank: number; integrated_top3_count: number }[] = [];

    const { data: rpcData, error: rpcError } = await supabase.rpc('aggregate_influencer_stats', {
      since_date: sinceDate,
    });

    if (rpcError) {
      console.log('[aggregate-influencers] RPC not available, using fallback query');
      // 폴백: 직접 keyword_rankings에서 집계
      const { data: rankings, error: fallbackErr } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, keyword_id, rank_position, is_integrated_top3')
        .gte('snapshot_date', sinceDate);

      if (fallbackErr) throw new Error(fallbackErr.message);

      // JS에서 GROUP BY 처리
      const grouped = new Map<string, { keywordIds: Set<string>; ranks: number[]; top3: number }>();
      for (const r of (rankings as { influencer_id: string; keyword_id: string; rank_position: number; is_integrated_top3: boolean }[]) || []) {
        const g = grouped.get(r.influencer_id) || { keywordIds: new Set(), ranks: [], top3: 0 };
        g.keywordIds.add(r.keyword_id);
        g.ranks.push(r.rank_position);
        if (r.is_integrated_top3) g.top3++;
        grouped.set(r.influencer_id, g);
      }

      stats = Array.from(grouped.entries()).map(([id, g]) => ({
        influencer_id: id,
        total_keywords: g.keywordIds.size,
        avg_rank: Math.round((g.ranks.reduce((a, b) => a + b, 0) / g.ranks.length) * 100) / 100,
        best_rank: Math.min(...g.ranks),
        integrated_top3_count: g.top3,
      }));
    } else {
      stats = rpcData || [];
    }

    if (stats.length === 0) {
      console.log('[aggregate-influencers] No ranking data found');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    // 배치 업데이트 (500개씩 병렬 처리)
    let processed = 0;
    let failed = 0;
    const BATCH = 500;

    for (let i = 0; i < stats.length; i += BATCH) {
      const batch = stats.slice(i, i + BATCH);
      const promises = batch.map((s) =>
        supabase
          .from('influencers')
          .update({
            total_keywords: Number(s.total_keywords),
            avg_rank: Number(s.avg_rank),
            best_rank: s.best_rank,
            integrated_top3_count: Number(s.integrated_top3_count),
          })
          .eq('id', s.influencer_id)
          .then(({ error }) => {
            if (error) {
              console.error(`[aggregate-influencers] Update error for ${s.influencer_id}:`, error.message);
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
