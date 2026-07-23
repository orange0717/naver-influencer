import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { createServiceClient } from '@/lib/supabase-server';
import { submitSitemapForUser } from '@/lib/sitemap-builder';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const TIME_BUDGET_MS = 100_000;

/**
 * GET /api/cron/google-indexing-resubmit-sitemaps
 * Google 계정이 연결된 사용자의 사이트맵을 하루 한 번 재제출한다.
 * 신규 등록 시점에도 즉시 제출하지만, 누락 없이 최신 상태를 유지하기 위한 안전망.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('google-indexing-resubmit-sitemaps');
  const startedAt = Date.now();

  try {
    const supabase = createServiceClient();
    const { data: connectedUsers, error } = await supabase
      .from('google_oauth_tokens')
      .select('user_id')
      .eq('site_verified', true);

    if (error) throw new Error(error.message);

    let processed = 0;
    let failed = 0;

    for (const row of connectedUsers ?? []) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const result = await submitSitemapForUser(row.user_id);
      if (result.success) processed++;
      else failed++;
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: connectedUsers?.length ?? 0,
      processed_items: processed,
      failed_items: failed,
    });

    return NextResponse.json({ success: true, total: connectedUsers?.length ?? 0, processed, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[google-indexing-resubmit-sitemaps] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
