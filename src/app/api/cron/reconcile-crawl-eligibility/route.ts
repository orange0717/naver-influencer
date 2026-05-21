import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { applyLongInactiveDeactivateFilters } from '@/lib/crawl-queue';

export const maxDuration = 120;

/**
 * 1년 이상 챌린지·TOP3 없는 인플은 is_active=false 로 표기해
 * 일일 크롤 큐·24h 커버리지 분모를 실제 운영 대상에 맞춘다.
 * UTC 16:30 (KST 01:30) — drain 직전.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('reconcile-crawl-eligibility');
  const supabase = createServiceClient();

  try {
    const { data: rows, error } = await applyLongInactiveDeactivateFilters(
      supabase.from('influencers').select('id'),
    ).limit(5000);

    if (error) throw new Error(error.message);

    const ids = (rows || []).map(r => r.id);
    let deactivated = 0;

    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { error: updErr, count } = await supabase
        .from('influencers')
        .update({ is_active: false })
        .in('id', batch);
      if (updErr) throw new Error(updErr.message);
      deactivated += count ?? batch.length;
    }

    const summary = { candidates: ids.length, deactivated };
    console.log('[reconcile-crawl-eligibility]', JSON.stringify(summary));

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: ids.length,
      processed_items: deactivated,
    });

    return NextResponse.json({ success: true, ...summary, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
