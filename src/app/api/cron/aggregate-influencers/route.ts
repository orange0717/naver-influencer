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

    // 모든 인플루언서 조회
    const { data: influencers } = await supabase
      .from('influencers')
      .select('id');

    if (!influencers || influencers.length === 0) {
      console.log('[aggregate-influencers] No influencers found');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    let processed = 0;
    let failed = 0;

    for (const inf of influencers) {
      try {
        // 이 인플루언서의 최근 순위 데이터 집계
        const { data: rankings } = await supabase
          .from('keyword_rankings')
          .select('rank_position, is_integrated_top3, keyword_id')
          .eq('influencer_id', inf.id)
          .gte('snapshot_date', sinceDate);

        if (!rankings || rankings.length === 0) continue;

        // 고유 키워드 수
        const uniqueKeywords = new Set(rankings.map(r => r.keyword_id));
        const totalKeywords = uniqueKeywords.size;

        // 평균 순위
        const avgRank = rankings.reduce((sum, r) => sum + r.rank_position, 0) / rankings.length;

        // 최고 순위 (가장 낮은 숫자)
        const bestRank = Math.min(...rankings.map(r => r.rank_position));

        // 통합검색 TOP 3 횟수
        const top3Count = rankings.filter(r => r.is_integrated_top3).length;

        const { error } = await supabase
          .from('influencers')
          .update({
            total_keywords: totalKeywords,
            avg_rank: Math.round(avgRank * 100) / 100,
            best_rank: bestRank,
            integrated_top3_count: top3Count,
          })
          .eq('id', inf.id);

        if (error) {
          console.error(`[aggregate-influencers] Update error for ${inf.id}:`, error.message);
          failed++;
        } else {
          processed++;
        }
      } catch (err) {
        console.error(`[aggregate-influencers] Error for ${inf.id}:`, err);
        failed++;
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: influencers.length,
      processed_items: processed,
      failed_items: failed,
    });

    console.log(`[Cron] aggregate-influencers done: ${processed}/${influencers.length} updated`);

    return NextResponse.json({
      success: true,
      total: influencers.length,
      processed,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[aggregate-influencers] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
