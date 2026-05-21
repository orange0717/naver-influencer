import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { dailyCrawlQueueOrFilter } from '@/lib/crawl-queue';

export const maxDuration = 60;

function activeInfluencerQuery(supabase: ReturnType<typeof createServiceClient>) {
  return supabase
    .from('influencers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .neq('stopped_manual', true);
}

function crawlTargetQuery(supabase: ReturnType<typeof createServiceClient>) {
  return supabase
    .from('influencers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .neq('stopped_manual', true)
    .or(dailyCrawlQueueOrFilter());
}

/** 24h 커버리지. coverage_pct = 일일 크롤 대상(crawl_target) 기준 100% 목표 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('verify-daily-coverage');
  const supabase = createServiceClient();

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalActive },
      { count: crawlTargetTotal },
      { count: crawlTargetStale },
      { count: crawlTargetNever },
      { count: allStale },
    ] = await Promise.all([
      activeInfluencerQuery(supabase),
      crawlTargetQuery(supabase),
      crawlTargetQuery(supabase).or(`last_crawled_at.is.null,last_crawled_at.lt.${cutoff}`),
      crawlTargetQuery(supabase).is('last_crawled_at', null),
      activeInfluencerQuery(supabase).or(`last_crawled_at.is.null,last_crawled_at.lt.${cutoff}`),
    ]);

    const total = totalActive || 0;
    const targetTotal = crawlTargetTotal || 0;
    const targetStale = crawlTargetStale || 0;
    const targetFresh = targetTotal - targetStale;
    const coverageTarget = targetTotal > 0 ? +(targetFresh / targetTotal * 100).toFixed(2) : 100;
    const coverageAll = total > 0 ? +(((total - (allStale || 0)) / total) * 100).toFixed(2) : 0;

    const summary = {
      total_active: total,
      crawl_target_total: targetTotal,
      crawled_last_24h: targetFresh,
      stale: targetStale,
      never_crawled: crawlTargetNever || 0,
      coverage_pct: coverageTarget,
      coverage_pct_all: coverageAll,
      stale_all_active: allStale || 0,
    };

    console.log('[verify-daily-coverage]', JSON.stringify(summary));

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: targetTotal,
      processed_items: targetFresh,
      failed_items: targetStale,
      error_message: targetStale > 0 ? `${targetStale} crawl-target rows stale (>24h)` : undefined,
    });

    return NextResponse.json({ success: true, ...summary, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[verify-daily-coverage] error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
