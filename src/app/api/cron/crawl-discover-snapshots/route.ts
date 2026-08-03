import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { NAVER_DOMAIN_CATEGORIES, fetchDiscoverCategory } from '@/lib/naver-topic-crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:crawl-discover-snapshots';
const CRON_LOCK_TTL_SECONDS = 660;
const TIME_BUDGET_MS = 270_000;

/** Discover 스냅샷 전용 크론 — 20개 도메인, 1일 1회 (snapshot_date UNIQUE 제약으로 중복 실행 방지)
 * crawl-naver-topics의 유저별 토픽 크롤이 시간 예산을 다 써버려 스냅샷 구간까지 못 가는 날이 잦아 분리함. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('crawl-discover-snapshots');
  const supabase = createServiceClient();

  let totalCategories = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  try {
    const today = new Date().toISOString().slice(0, 10);

    for (const category of NAVER_DOMAIN_CATEGORIES) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      const { count } = await supabase
        .from('naver_discover_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', category.id)
        .eq('snapshot_date', today);
      if (count && count > 0) {
        totalSkipped++;
        continue;
      }

      try {
        const snapshot = await fetchDiscoverCategory(category);
        const rows = [
          { collection_type: 'LATEST' as const, pool_id: '', pool_name: null, items: snapshot.latest },
          { collection_type: 'POPULAR' as const, pool_id: snapshot.popular.poolId, pool_name: snapshot.popular.poolName, items: snapshot.popular.items },
          { collection_type: 'EXPERT' as const, pool_id: snapshot.expert.poolId, pool_name: snapshot.expert.poolName, items: snapshot.expert.items },
          { collection_type: 'SPECIALTY' as const, pool_id: snapshot.specialty.poolId, pool_name: snapshot.specialty.poolName, items: snapshot.specialty.items },
        ].map(r => ({
          category_id: category.id,
          category_name: category.name,
          collection_type: r.collection_type,
          pool_id: r.pool_id,
          pool_name: r.pool_name,
          items: r.items,
          snapshot_date: today,
        }));

        await supabase.from('naver_discover_snapshots').upsert(rows, { onConflict: 'category_id,collection_type,pool_id,snapshot_date' });
        totalCategories++;
      } catch (err) {
        totalFailed++;
        console.error(`[crawl-discover-snapshots] category failed (${category.name}):`, err);
      }

      await sleep(300);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: NAVER_DOMAIN_CATEGORIES.length,
      processed_items: totalCategories,
      failed_items: totalFailed,
    });

    return NextResponse.json({ success: true, totalCategories, totalSkipped, totalFailed });
  } catch (err) {
    console.error('[crawl-discover-snapshots] fatal error:', err);
    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: '크론 실행 실패' }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
