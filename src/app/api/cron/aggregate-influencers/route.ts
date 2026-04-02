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
    // 전체 keyword_rankings에서 키워드당 최신 스냅샷 기준으로 집계
    // 페이징으로 전체 데이터 로드 (Supabase 1000건 제한 우회)
    console.log(`[aggregate-influencers] 전체 랭킹 데이터 로드 시작`);

    const PAGE_SIZE = 1000;
    let allRankings: { influencer_id: string; keyword_id: string; rank_position: number; is_integrated_top3: boolean; snapshot_date: string }[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, keyword_id, rank_position, is_integrated_top3, snapshot_date')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRankings = allRankings.concat(data as typeof allRankings);
        console.log(`[aggregate-influencers] 페이지 로드: ${data.length}건 (누적: ${allRankings.length}건)`);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }

    const rankings = allRankings;

    if (rankings.length === 0) {
      console.log('[aggregate-influencers] No ranking data found');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    console.log(`[aggregate-influencers] 랭킹 ${rankings.length}건 로드`);

    // 인플루언서별로 키워드당 최신 스냅샷만 사용 (중복 방지)
    type RankingRow = typeof rankings[number];

    // 인플루언서+키워드별 최신 레코드만 추출
    const latestMap = new Map<string, RankingRow>();
    for (const r of rankings) {
      const key = `${r.influencer_id}:${r.keyword_id}`;
      const existing = latestMap.get(key);
      if (!existing || r.snapshot_date > existing.snapshot_date) {
        latestMap.set(key, r);
      }
    }

    // JS에서 GROUP BY 처리
    const grouped = new Map<string, {
      keywordIds: Set<string>;
      ranks: number[];
      top3: number;
      top1: number;
      top2: number;
      top3Only: number;
    }>();

    for (const r of latestMap.values()) {
      const g = grouped.get(r.influencer_id) || { keywordIds: new Set(), ranks: [], top3: 0, top1: 0, top2: 0, top3Only: 0 };
      g.keywordIds.add(r.keyword_id);
      g.ranks.push(r.rank_position);
      if (r.is_integrated_top3) g.top3++;
      if (r.rank_position === 1) g.top1++;
      else if (r.rank_position === 2) g.top2++;
      else if (r.rank_position === 3) g.top3Only++;
      grouped.set(r.influencer_id, g);
    }

    const stats = Array.from(grouped.entries()).map(([id, g]) => ({
      influencer_id: id,
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
