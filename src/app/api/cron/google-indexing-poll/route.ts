import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { createServiceClient } from '@/lib/supabase-server';
import { inspectAndUpdate } from '@/lib/google-indexing-poll';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 200;
const TIME_BUDGET_MS = 100_000; // 120초 제한 안에서 여유 두고 종료

/** GET /api/cron/google-indexing-poll — next_check_at 도래한 URL의 색인 상태를 재확인 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('google-indexing-poll');
  const startedAt = Date.now();

  try {
    const supabase = createServiceClient();
    const { data: rows, error } = await supabase
      .from('indexed_urls')
      .select('id, user_id, url, check_count')
      .in('status', ['submitted', 'checking'])
      .lte('next_check_at', new Date().toISOString())
      .limit(BATCH_SIZE);

    if (error) throw new Error(error.message);

    let processed = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      try {
        await inspectAndUpdate(row);
        processed++;
      } catch (err) {
        failed++;
        console.error('[google-indexing-poll] row failed:', row.id, err instanceof Error ? err.message : err);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: rows?.length ?? 0,
      processed_items: processed,
      failed_items: failed,
    });

    return NextResponse.json({ success: true, total: rows?.length ?? 0, processed, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[google-indexing-poll] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
