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
    // 최근 7일 이내 snapshot 기준으로 집계 (원래 로직)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

    console.log(`[aggregate-influencers] 집계 범위: ${sinceDate} ~ 현재`);

    // keyword_rankings에서 집계
    const { data: rankings, error: fetchErr } = await supabase
      .from('keyword_rankings')
      .select('influencer_id, keyword_id, rank_position, is_integrated_top3')
      .gte('snapshot_date', sinceDate);

    if (fetchErr) throw new Error(fetchErr.message);

    if (!rankings || rankings.length === 0) {
      console.log('[aggregate-influencers] No ranking data found');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    console.log(`[aggregate-influencers] 랭킹 ${rankings.length}건 로드`);

    // JS에서 GROUP BY 처리
    const grouped = new Map<string, {
      keywordIds: Set<string>;
      ranks: number[];
      top3: number;
      top1: number;
      top2: number;
      top3Only: number;
    }>();

    for (const r of (rankings as { influencer_id: string; keyword_id: string; rank_position: number; is_integrated_top3: boolean }[])) {
      const g = grouped.get(r.influencer_id) || { keywordIds: new Set(), ranks: [], top3: 0, top1: 0, top2: 0, top3Only: 0 };
      g.keywordIds.add(r.keyword_id);
      g.ranks.push(r.rank_position);
      if (r.is_integrated_top3) g.top3++;
      if (r.rank_position === 1) g.top1++;
      else if (r.rank_position === 2) g.top2++;
      else if (r.rank_position === 3) g.top3Only++;
      grouped.set(r.influencer_id, g);
    }

    // influencer_keywords 테이블에서 실제 참여 키워드 수 가져오기
    const influencerIds = Array.from(grouped.keys());
    const ikCounts = new Map<string, number>();

    // 배치로 조회 (500개씩)
    for (let i = 0; i < influencerIds.length; i += 500) {
      const batch = influencerIds.slice(i, i + 500);
      const { data: ikData } = await supabase
        .from('influencer_keywords')
        .select('influencer_id')
        .in('influencer_id', batch);

      if (ikData) {
        for (const ik of ikData) {
          ikCounts.set(ik.influencer_id, (ikCounts.get(ik.influencer_id) || 0) + 1);
        }
      }
    }

    console.log(`[aggregate-influencers] influencer_keywords 카운트 완료: ${ikCounts.size}명`);

    const stats = Array.from(grouped.entries()).map(([id, g]) => ({
      influencer_id: id,
      // influencer_keywords 기반 참여 키워드 수 (없으면 keyword_rankings 기반 유니크 수)
      total_keywords: ikCounts.get(id) || g.keywordIds.size,
      avg_rank: Math.round((g.ranks.reduce((a, b) => a + b, 0) / g.ranks.length) * 100) / 100,
      best_rank: Math.min(...g.ranks),
      integrated_top3_count: g.top3,
      top1_count: g.top1,
      top2_count: g.top2,
      top3_count: g.top3Only,
    }));

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
            // total_keywords는 여기서 업데이트하지 않음 (네이버 원본 데이터 유지)
            avg_rank: Number(s.avg_rank),
            best_rank: s.best_rank,
            integrated_top3_count: Number(s.integrated_top3_count),
            top1_count: s.top1_count,
            top2_count: s.top2_count,
            top3_count: s.top3_count,
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
