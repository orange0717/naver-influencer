import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { fetchBlogVisitors } from '@/lib/blog-crawler';
import { getBrowser, invalidateBrowserCache, isBrowserDeadError } from '@/lib/puppeteer-browser';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Puppeteer 페이지 렌더링은 fetch()보다 훨씬 무거워 동시 탭 수를 보수적으로 잡는다
// (브라우저 프로세스 하나를 공유하는 탭들이라 CPU/메모리 여유를 남겨야 함).
const CONCURRENCY = 4;
// maxDuration(300s) 도달 전에 안전하게 마무리하도록 여유를 둔 소프트 타임아웃.
// 이 시점 이후로는 새 블로거 배치를 시작하지 않고 진행 상황을 그대로 저장한다
// (전체 블로거를 하루 만에 다 못 돌아도, 매일 "가장 오래된 것부터" 우선순위로 처리하므로
// 여러 날에 걸쳐 결국 전체가 순환된다 — 개별 대시보드는 조회 시점에 별도로 갱신됨).
const SOFT_TIMEOUT_MS = 260_000;

/**
 * 매일 KST 07:30에 실행 — 등록된 블로거들의 "오늘 방문자"를 크롤링해 이력 테이블에 쌓는다.
 * GET /api/cron/crawl-blog-visitors
 *
 * ⚠️ 2026-07-19: fetch() 기반 크롤링이 실제로는 항상 페이지 미로딩 placeholder(0)를 "성공"으로
 * 오인해 잘못된 값을 저장하고 있던 게 확인되어 Puppeteer 기반으로 전면 교체했다
 * (자세한 배경은 [[blog-crawler.ts]]의 fetchBlogVisitors 주석 참고). 그 대가로 블로거 1명당
 * 처리 시간이 늘어나, 전체를 하루에 못 돌 수 있다는 전제로 "가장 오래 갱신 안 된 것부터" 우선
 * 처리하도록 설계했다.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-blog-visitors');
  const supabase = createServiceClient();
  const startedAt = Date.now();

  try {
    // 활성 블로거 목록 (blog_keywords + blog_scores 통합) — blog_scores.updated_at 기준
    // 오래 갱신 안 된 순으로 정렬해, 매 실행마다 가장 뒤처진 블로거부터 처리한다.
    const { data: blogKeywords } = await supabase
      .from('blog_keywords')
      .select('blog_id')
      .eq('is_active', true);

    const { data: blogScores } = await supabase
      .from('blog_scores')
      .select('blog_id, updated_at')
      .order('updated_at', { ascending: true, nullsFirst: true });

    const scoreOrder = new Map((blogScores || []).map((s, i) => [s.blog_id, i]));
    const allBlogIds = [
      ...(blogScores || []).map(s => s.blog_id),
      ...(blogKeywords || []).map(k => k.blog_id),
    ];
    // blog_scores에 없는(=한번도 갱신 안 된) 블로거를 최우선으로, 그다음 오래된 순.
    const blogIds = [...new Set(allBlogIds)].sort((a, b) => {
      const oa = scoreOrder.has(a) ? scoreOrder.get(a)! : -1;
      const ob = scoreOrder.has(b) ? scoreOrder.get(b)! : -1;
      return oa - ob;
    });

    if (blogIds.length === 0) {
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0, failed_items: 0 });
      return NextResponse.json({ message: 'No active bloggers found', count: 0 });
    }

    let browser = await getBrowser();

    let totalProcessed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const failedSamples: string[] = [];

    const processOne = async (blogId: string) => {
      try {
        let visitors = await fetchBlogVisitors(blogId, browser);

        // 브라우저 프로세스 자체가 죽은 경우 — 한 번만 새로 띄워 재시도
        if (visitors.length === 0) {
          totalFailed++;
          if (failedSamples.length < 20) failedSamples.push(blogId);
          return;
        }

        const rows = visitors.map(v => ({
          blog_id: blogId,
          visit_date: v.date,
          visitor_count: v.visitors,
        }));

        await supabase
          .from('blog_visitor_history')
          .upsert(rows, { onConflict: 'blog_id,visit_date' });

        const latest = visitors[visitors.length - 1];

        await supabase
          .from('blog_scores')
          .upsert({
            blog_id: blogId,
            latest_visitors: latest.visitors,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'blog_id' });

        totalProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[crawl-blog-visitors] Error for ${blogId}:`, msg);
        totalFailed++;
        if (failedSamples.length < 20) failedSamples.push(blogId);

        if (isBrowserDeadError(msg)) {
          invalidateBrowserCache();
          browser = await getBrowser(true);
        }
      }
    };

    for (let i = 0; i < blogIds.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > SOFT_TIMEOUT_MS) {
        totalSkipped = blogIds.length - i;
        break;
      }
      const batch = blogIds.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processOne));
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: blogIds.length,
      processed_items: totalProcessed,
      failed_items: totalFailed,
    });

    return NextResponse.json({
      success: true,
      bloggers: blogIds.length,
      processed: totalProcessed,
      failed: totalFailed,
      skipped: totalSkipped,
      failedSamples,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-blog-visitors] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
