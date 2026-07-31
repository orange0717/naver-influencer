import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchBlogPostList } from '@/lib/blog-post-list';
import { submitSitemapForUser } from '@/lib/sitemap-builder';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const TIME_BUDGET_MS = 100_000; // 전체 실행 시간 예산 (maxDuration 120s보다 여유 있게)
const PAGE_FETCH_DELAY_MS = 400; // 네이버에 너무 빠르게 연속 요청하지 않도록 페이지 사이 간격
const STAGGER_STEP_MS = 90 * 1000; // GSC 첫 확인 시각을 90초씩 벌림 (bulk-register와 동일 정책)
const FIRST_CHECK_BASE_MS = 30 * 60 * 1000;

interface BulkJobRow {
  user_id: string;
  blog_id: string;
  page_size: number;
  next_page: number;
  total_count: number | null;
  registered_count: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /api/cron/google-indexing-bulk-continue
 * "전체 포스트 등록"이 한 요청에서 다 못 가져온 사용자(bulk_index_jobs.status='running')를
 * 이어서 처리한다. 매 실행마다 시간 예산 안에서 여러 페이지를 가져와 등록하고,
 * 다 가져오면(글이 더 없거나 registered_count >= total_count) completed로 마감한다.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('google-indexing-bulk-continue');
  const startedAt = Date.now();
  const supabase = createServiceClient();

  let jobsProcessed = 0;
  let jobsCompleted = 0;
  let totalRegistered = 0;
  let failed = 0;

  try {
    const { data: jobs, error } = await supabase
      .from('bulk_index_jobs')
      .select('user_id, blog_id, page_size, next_page, total_count, registered_count')
      .eq('status', 'running')
      .order('updated_at', { ascending: true });

    if (error) throw new Error(error.message);

    for (const job of (jobs ?? []) as BulkJobRow[]) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      try {
        let page = job.next_page;
        let registeredCount = job.registered_count;
        let totalCount = job.total_count ?? 0;
        let registeredThisRun = 0;
        let done = false;

        while (Date.now() - startedAt < TIME_BUDGET_MS) {
          const result = await fetchBlogPostList(job.blog_id, page, job.page_size);
          totalCount = result.totalCount || totalCount;

          if (result.posts.length === 0) {
            done = true;
            break;
          }

          const now = Date.now();
          const rows = result.posts.map((post, i) => ({
            user_id: job.user_id,
            blog_id: job.blog_id,
            post_no: post.id,
            url: post.url,
            title: post.title,
            source: 'bulk_all',
            status: 'submitted',
            progress_stage: 'requesting',
            registered_at: new Date(now).toISOString(),
            next_check_at: new Date(now + FIRST_CHECK_BASE_MS + (registeredCount + i) * STAGGER_STEP_MS).toISOString(),
            check_count: 0,
          }));

          const { error: upsertErr } = await supabase
            .from('indexed_urls')
            .upsert(rows, { onConflict: 'user_id,url', ignoreDuplicates: true });
          if (upsertErr) throw new Error(upsertErr.message);

          registeredCount += result.posts.length;
          registeredThisRun += result.posts.length;
          page += 1;

          // 진행 상황을 매 페이지마다 저장해, 이 실행이 시간 예산으로 중단되더라도
          // 다음 실행이 처음부터 다시 하지 않고 이어서 하게 한다.
          await supabase
            .from('bulk_index_jobs')
            .update({
              next_page: page,
              total_count: totalCount,
              registered_count: registeredCount,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', job.user_id);

          if (totalCount > 0 && registeredCount >= totalCount) {
            done = true;
            break;
          }

          await sleep(PAGE_FETCH_DELAY_MS);
        }

        if (done) {
          await supabase
            .from('bulk_index_jobs')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('user_id', job.user_id);
          jobsCompleted++;
        }

        if (registeredThisRun > 0) {
          submitSitemapForUser(job.user_id).catch(() => {});
        }

        totalRegistered += registeredThisRun;
        jobsProcessed++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[google-indexing-bulk-continue] job failed:', job.user_id, msg);
        await supabase
          .from('bulk_index_jobs')
          .update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() })
          .eq('user_id', job.user_id);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: jobs?.length ?? 0,
      processed_items: jobsProcessed,
      failed_items: failed,
    });

    return NextResponse.json({
      success: true,
      totalJobs: jobs?.length ?? 0,
      jobsProcessed,
      jobsCompleted,
      totalRegistered,
      failed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[google-indexing-bulk-continue] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
