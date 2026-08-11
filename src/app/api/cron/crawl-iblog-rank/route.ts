import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep } from '@/lib/crawler';
import { collectKeywordExposure, aggregateDailyRanking } from '@/lib/iblog-rank';

export const dynamic = 'force-dynamic';
/** 전 카테고리 ~300개 키워드를 하루 여러 배치로 순회 — 배치당 최대 시간 확보 */
export const maxDuration = 300;

/** 한 번의 실행(배치)에서 처리할 키워드 수 기본값 — maxDuration 300초 내 안전 */
const DEFAULT_BATCH_SIZE = 50;

/**
 * 블로그 순위 통합검색 수집 크론 (배치)
 *   - 활성 키워드 중 오늘 아직 수집하지 않은 것을 batch size 만큼 통합검색 수집
 *   - iblog_rank_results / iblog_rank_blogs 갱신
 *   - 오늘치 활성 키워드가 모두 수집 완료되면 일별 순위 집계까지 수행
 * GET /api/cron/crawl-iblog-rank?size=12
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sizeParam = Number(new URL(request.url).searchParams.get('size'));
  const batchSize = Number.isFinite(sizeParam) && sizeParam > 0 ? Math.min(sizeParam, 100) : DEFAULT_BATCH_SIZE;

  const jobId = await createCrawlJob('crawl-iblog-rank');
  const supabase = createServiceClient();
  const today = new Date().toISOString().split('T')[0];

  try {
    // 오늘 아직 수집하지 않은 활성 키워드 batch 선택
    const { data: keywords, error: kwErr } = await supabase
      .from('iblog_rank_keywords')
      .select('id, keyword')
      .eq('is_active', true)
      .or(`last_crawled_date.is.null,last_crawled_date.neq.${today}`)
      .order('last_crawled_date', { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (kwErr) throw kwErr;

    let processed = 0;
    let failed = 0;

    for (const kw of keywords || []) {
      try {
        const exposure = await collectKeywordExposure(kw.keyword);

        if (exposure.size > 0) {
          // 블로거 정보 upsert — 이름 있는 행/없는 행을 분리해 기존 이름을 null 로 덮지 않음
          const withName: Array<Record<string, unknown>> = [];
          const withoutName: Array<Record<string, unknown>> = [];
          for (const [blogId, exp] of exposure) {
            const base = {
              blog_id: blogId,
              blog_url: `https://blog.naver.com/${blogId}`,
              last_seen_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (exp.blogName) withName.push({ ...base, blog_name: exp.blogName });
            else withoutName.push(base);
          }
          if (withName.length > 0) {
            await supabase.from('iblog_rank_blogs').upsert(withName, { onConflict: 'blog_id' });
          }
          if (withoutName.length > 0) {
            await supabase.from('iblog_rank_blogs').upsert(withoutName, { onConflict: 'blog_id' });
          }

          // 키워드×블로거 노출 결과 upsert
          const resultRows = [...exposure.entries()].map(([blogId, exp]) => ({
            snapshot_date: today,
            keyword: kw.keyword,
            blog_id: blogId,
            exposure_count: exp.exposureCount,
            best_position: exp.bestPosition,
            source: exp.source,
            post_ids: exp.postIds,
          }));
          const { error: rErr } = await supabase
            .from('iblog_rank_results')
            .upsert(resultRows, { onConflict: 'snapshot_date,keyword,blog_id' });
          if (rErr) throw rErr;
        }

        await supabase
          .from('iblog_rank_keywords')
          .update({ last_crawled_date: today, updated_at: new Date().toISOString() })
          .eq('id', kw.id);

        processed += 1;
      } catch (err) {
        failed += 1;
        console.error(`[crawl-iblog-rank] 키워드 수집 실패 (${kw.keyword}):`, err);
      }

      await sleep(800); // 네이버 부하 완화
    }

    // 오늘치 활성 키워드가 모두 수집 완료되었으면 일별 순위 집계
    const { count: remaining } = await supabase
      .from('iblog_rank_keywords')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(`last_crawled_date.is.null,last_crawled_date.neq.${today}`);

    let aggregated: { blogs: number; previousDate: string | null } | null = null;
    if ((remaining ?? 0) === 0) {
      const summary = await aggregateDailyRanking(supabase, today);
      aggregated = { blogs: summary.blogs, previousDate: summary.previousDate };
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: (keywords || []).length,
      processed_items: processed,
      failed_items: failed,
    });

    return NextResponse.json({
      success: true,
      date: today,
      batchSize,
      processed,
      failed,
      remaining: remaining ?? 0,
      aggregated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-iblog-rank] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
