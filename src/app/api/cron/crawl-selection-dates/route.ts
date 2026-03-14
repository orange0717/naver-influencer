import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BATCH_SIZE = 30; // Vercel 60초 내 처리 가능한 수

/** 네이버 인플루언서 프로필에서 선정일(createdAt) 추출 */
async function fetchSelectionDate(naverId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`https://in.naver.com/${naverId}`, {
      headers: {
        'User-Agent': MAC_UA,
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // __PRELOADED_STATE__ JSON에서 createdAt 추출
    const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (!stateMatch) return null;

    const state = JSON.parse(stateMatch[1]);
    const createdAt = state?.space?.data?.createdAt;

    if (createdAt && typeof createdAt === 'string') {
      return createdAt;
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-selection-dates');
  const supabase = createServiceClient();
  let processed = 0;
  let updated = 0;
  let failed = 0;

  console.log('[Cron] crawl-selection-dates started');

  try {
    // 선정일이 아직 없는 인플루언서 가져오기
    const { data: influencers } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .is('naver_created_at', null)
      .order('subscriber_count', { ascending: false })
      .limit(BATCH_SIZE);

    if (!influencers || influencers.length === 0) {
      console.log('[crawl-selection-dates] All influencers already have selection dates');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, message: 'All done', updated: 0 });
    }

    console.log(`[crawl-selection-dates] Processing ${influencers.length} influencers`);

    for (const inf of influencers) {
      processed++;

      const createdAt = await fetchSelectionDate(inf.naver_id);

      if (createdAt) {
        const { error } = await supabase
          .from('influencers')
          .update({ naver_created_at: createdAt })
          .eq('id', inf.id);

        if (!error) {
          updated++;
          console.log(`[crawl-selection-dates] ${inf.naver_id}: ${createdAt}`);
        } else {
          console.error(`[crawl-selection-dates] DB update error for ${inf.naver_id}:`, error.message);
          failed++;
        }
      } else {
        console.log(`[crawl-selection-dates] ${inf.naver_id}: not found`);
        failed++;
      }

      // 네이버 차단 방지 딜레이
      await sleep(600);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: influencers.length,
      processed_items: processed,
      failed_items: failed,
    });

    console.log(`[crawl-selection-dates] Done: ${updated}/${processed} updated, ${failed} failed`);

    return NextResponse.json({
      success: true,
      total: influencers.length,
      updated,
      failed,
      remaining: influencers.length === BATCH_SIZE ? 'more to process' : 'all done',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-selection-dates] Fatal:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      processed_items: processed,
      failed_items: failed,
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
