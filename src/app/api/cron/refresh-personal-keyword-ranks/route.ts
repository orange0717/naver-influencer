import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { checkBlogTab, checkViewTab, getSearchVolume, CACHE_TTL_SEC, type RankCheckResult } from '@/lib/keyword-rank-check';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 280;

const STALE_MINUTES = 10;
const BATCH_SIZE = 40;
const CONCURRENCY = 4;
const LOCK_KEY = 'refresh-personal-keyword-ranks';

type LookupRow = {
  id: string;
  blog_id: string;
  post_id: string;
  keyword: string;
};

/**
 * /my/keyword-ranking 백그라운드 순위 갱신 큐.
 * keyword_rank_lookups 중 미확인(checked_at IS NULL) 또는 10분 초과 stale 행을 우선순위로 처리.
 * 10분 간격 실행 → 실질적으로 "키워드 저장 → 큐 실행 → 네이버 조회 → DB 갱신"이 자동으로 이어진다.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const locked = await tryAcquireCronLock(LOCK_KEY, 600);
  if (!locked) {
    return NextResponse.json({ message: 'Already running, skipped' });
  }

  const jobId = await createCrawlJob('refresh-personal-keyword-ranks');
  const supabase = createServiceClient();
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  let processed = 0;
  let failed = 0;

  try {
    // 미확인(NULL) 우선, 남는 슬롯을 stale 행으로 채움
    const { data: nullRows, error: nullErr } = await supabase
      .from('keyword_rank_lookups')
      .select('id, blog_id, post_id, keyword')
      .is('checked_at', null)
      .limit(BATCH_SIZE);
    if (nullErr) throw nullErr;

    const remaining = BATCH_SIZE - (nullRows?.length || 0);
    let staleRows: LookupRow[] = [];
    if (remaining > 0) {
      const { data, error: staleErr } = await supabase
        .from('keyword_rank_lookups')
        .select('id, blog_id, post_id, keyword')
        .lt('checked_at', staleBefore)
        .order('checked_at', { ascending: true })
        .limit(remaining);
      if (staleErr) throw staleErr;
      staleRows = (data ?? []) as LookupRow[];
    }

    const rows = [...((nullRows ?? []) as LookupRow[]), ...staleRows];

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const wave = rows.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(wave.map(async (row) => {
        const cacheKey = `rank:${row.blog_id}:${row.post_id}:kw:${row.keyword}`;
        let result = await cacheGet<RankCheckResult>(cacheKey);

        if (!result) {
          const [blogTab, viewTab] = await Promise.all([
            checkBlogTab(row.keyword, row.blog_id, row.post_id),
            checkViewTab(row.keyword, row.blog_id, row.post_id),
          ]);
          const searchVolume = await getSearchVolume(row.keyword);
          result = {
            blogTab,
            viewTab,
            query: row.keyword,
            searchVolume,
            checkedAt: new Date().toISOString(),
          };
          await cacheSet(cacheKey, result, CACHE_TTL_SEC);
        }

        const { error: updateErr } = await supabase
          .from('keyword_rank_lookups')
          .update({
            view_rank: result.viewTab.rank,
            view_exposed: result.viewTab.exposed,
            blog_rank: result.blogTab.rank,
            blog_exposed: result.blogTab.exposed,
            search_volume: result.searchVolume,
            checked_at: result.checkedAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (updateErr) throw updateErr;
      }));

      for (const r of results) {
        if (r.status === 'fulfilled') processed++;
        else { failed++; console.error('[refresh-personal-keyword-ranks] row failed:', r.reason); }
      }

      if (i + CONCURRENCY < rows.length) await sleep(600);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: rows.length,
      processed_items: processed,
      failed_items: failed,
    });

    return NextResponse.json({ success: true, total: rows.length, processed, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[refresh-personal-keyword-ranks] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg, processed_items: processed, failed_items: failed });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(LOCK_KEY);
  }
}
