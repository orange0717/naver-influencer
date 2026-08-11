import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { checkBlogTab, checkViewTab, checkInfluencerTab, getSearchVolume, CACHE_TTL_SEC, type RankCheckResult } from '@/lib/keyword-rank-check';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 280;

const STALE_MINUTES = 10;
const BATCH_SIZE = 40;
const CONCURRENCY = 4;
const LOCK_KEY = 'refresh-personal-keyword-ranks';
// 연속 조회 실패가 이 횟수에 도달하면 'unanalyzable'로 전환해 재조회 큐에서 제외한다(무한 재시도 방지).
const FAIL_THRESHOLD = 5;

type LookupRow = {
  id: string;
  user_id: string;
  blog_id: string;
  post_id: string;
  keyword: string;
  fail_count: number | null;
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
    // 미확인(NULL) 우선, 남는 슬롯을 stale 행으로 채움.
    // 분석불가(status='unanalyzable') 행은 연속 실패로 재조회를 중단한 상태이므로 큐에서 제외한다.
    const { data: nullRows, error: nullErr } = await supabase
      .from('keyword_rank_lookups')
      .select('id, user_id, blog_id, post_id, keyword, fail_count')
      .is('checked_at', null)
      .neq('status', 'unanalyzable')
      .limit(BATCH_SIZE);
    if (nullErr) throw nullErr;

    const remaining = BATCH_SIZE - (nullRows?.length || 0);
    let staleRows: LookupRow[] = [];
    if (remaining > 0) {
      const { data, error: staleErr } = await supabase
        .from('keyword_rank_lookups')
        .select('id, user_id, blog_id, post_id, keyword, fail_count')
        .lt('checked_at', staleBefore)
        .neq('status', 'unanalyzable')
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
        // 캐시엔 정상 결과만 저장하므로 캐시 히트면 오류 아님. 신규 조회 시에만 3탭 오류 여부를 판정한다.
        let allErrored = false;

        if (!result) {
          const [blogTab, viewTab, influencerTab] = await Promise.all([
            checkBlogTab(row.keyword, row.blog_id, row.post_id),
            checkViewTab(row.keyword, row.blog_id, row.post_id),
            checkInfluencerTab(row.keyword, row.blog_id, row.post_id),
          ]);
          // 세 탭 모두 전 페이지 로드 실패 = '일시적 오류'. 미노출로 오판하지 않도록 기존 값을 보존한다(스펙 #8).
          allErrored = Boolean(blogTab.error) && Boolean(viewTab.error) && Boolean(influencerTab.error);
          const searchVolume = allErrored ? 0 : await getSearchVolume(row.keyword);
          result = {
            blogTab,
            viewTab,
            influencerTab,
            query: row.keyword,
            searchVolume,
            checkedAt: new Date().toISOString(),
          };
          // 오류 결과는 캐시하지 않는다 — 다음 실행에서 정상 재확인되도록.
          if (!allErrored) await cacheSet(cacheKey, result, CACHE_TTL_SEC);
        }

        // 일시적 오류: 순위/노출/checked_at을 덮어쓰지 않고 fail_count만 누적. 임계치 도달 시 분석불가로 전환.
        if (allErrored) {
          const nextFail = (row.fail_count ?? 0) + 1;
          const nextStatus = nextFail >= FAIL_THRESHOLD ? 'unanalyzable' : 'error';
          const { error: failErr } = await supabase
            .from('keyword_rank_lookups')
            .update({ status: nextStatus, fail_count: nextFail, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (failErr) throw failErr;
          return;
        }

        // 정상 조회 — 탭별로 오류인 항목은 null(미확인) 유지, 정상 항목만 실제 값 저장.
        const checkedAt = result.checkedAt;
        const viewExposed = result.viewTab.error ? null : result.viewTab.exposed;
        const blogExposed = result.blogTab.error ? null : result.blogTab.exposed;
        const infExposed = result.influencerTab.error ? null : result.influencerTab.exposed;
        const viewRank = result.viewTab.error ? null : result.viewTab.rank;
        const blogRank = result.blogTab.error ? null : result.blogTab.rank;
        const infRank = result.influencerTab.error ? null : result.influencerTab.rank;

        const { error: updateErr } = await supabase
          .from('keyword_rank_lookups')
          .update({
            view_rank: viewRank,
            view_exposed: viewExposed,
            blog_rank: blogRank,
            blog_exposed: blogExposed,
            influencer_rank: infRank,
            influencer_exposed: infExposed,
            search_volume: result.searchVolume,
            status: 'ok',
            fail_count: 0,
            checked_at: checkedAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (updateErr) throw updateErr;

        // 순위 이력 적재 (전일대비/7일대비 계산 근거) — 오류 탭은 null을 실제 datapoint로 남기지 않도록 제외.
        const historyRows = [
          { search_type: 'integrated', rank: viewRank, errored: Boolean(result.viewTab.error) },
          { search_type: 'blog', rank: blogRank, errored: Boolean(result.blogTab.error) },
          { search_type: 'influencer', rank: infRank, errored: Boolean(result.influencerTab.error) },
        ]
          .filter(h => !h.errored)
          .map(h => ({ user_id: row.user_id, blog_id: row.blog_id, post_id: row.post_id, keyword: row.keyword, search_type: h.search_type, rank: h.rank, checked_at: checkedAt }));

        if (historyRows.length > 0) {
          const { error: historyErr } = await supabase
            .from('keyword_rank_history')
            .upsert(historyRows, { onConflict: 'user_id,post_id,keyword,search_type,checked_at', ignoreDuplicates: true });
          if (historyErr) console.error('[refresh-personal-keyword-ranks] history 저장 실패:', historyErr);
        }
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
