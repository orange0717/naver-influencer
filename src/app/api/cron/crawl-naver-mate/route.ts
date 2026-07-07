import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { crawlNaverMates } from '@/lib/naver-mate-crawler';

// 25개 주제 × 4개 서비스 = 100회 순차 요청(요청 간 400ms 대기) → 넉넉히 확보
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-naver-mate');

  try {
    const result = await crawlNaverMates();

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: result.totalFetched,
      processed_items: result.totalUpserted,
      failed_items: result.failedTopics.length,
      error_message: result.failedTopics.length ? `실패: ${result.failedTopics.join(', ')}` : undefined,
    });

    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-naver-mate] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
