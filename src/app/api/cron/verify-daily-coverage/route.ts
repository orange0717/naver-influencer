import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

export const maxDuration = 60;

/**
 * 매일 아침 6:30 KST (21:30 UTC) 에 실행.
 * 활성 인플루언서 중 last_crawled_at 이 24시간 이상 지난 건수 집계.
 * 결과는 crawl_jobs 테이블에 기록되며 /admin/crawler 페이지에서 조회 가능.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('verify-daily-coverage');
  const supabase = createServiceClient();

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: totalActive } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .gt('total_keywords', 0);

    const { count: stale } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .gt('total_keywords', 0)
      .or(`last_crawled_at.is.null,last_crawled_at.lt.${cutoff}`);

    const { count: neverCrawled } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .gt('total_keywords', 0)
      .is('last_crawled_at', null);

    const total = totalActive || 0;
    const staleCount = stale || 0;
    const fresh = total - staleCount;
    const coverage = total > 0 ? +(fresh / total * 100).toFixed(2) : 0;

    const summary = {
      total_active: total,
      crawled_last_24h: fresh,
      stale: staleCount,
      never_crawled: neverCrawled || 0,
      coverage_pct: coverage,
    };

    console.log('[verify-daily-coverage]', JSON.stringify(summary));

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: total,
      processed_items: fresh,
      failed_items: staleCount,
      error_message: staleCount > 0 ? `${staleCount} influencers not crawled in last 24h` : undefined,
    });

    return NextResponse.json({ success: true, ...summary, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[verify-daily-coverage] error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
