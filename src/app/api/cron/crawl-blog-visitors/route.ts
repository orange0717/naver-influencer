import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { fetchBlogVisitors } from '@/lib/blog-crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const CONCURRENCY = 8;

/**
 * 매일 KST 07:30에 실행 — 등록된 블로거들의 방문자수를 크롤링
 * GET /api/cron/crawl-blog-visitors
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-blog-visitors');
  const supabase = createServiceClient();

  try {
    // 활성 블로거 목록 (blog_keywords + blog_scores 통합)
    const { data: blogKeywords } = await supabase
      .from('blog_keywords')
      .select('blog_id')
      .eq('is_active', true);

    const { data: blogScores } = await supabase
      .from('blog_scores')
      .select('blog_id');

    const allBlogIds = [
      ...(blogKeywords || []).map(k => k.blog_id),
      ...(blogScores || []).map(s => s.blog_id),
    ];
    const blogIds = [...new Set(allBlogIds)];
    if (blogIds.length === 0) {
      return NextResponse.json({ message: 'No active bloggers found', count: 0 });
    }

    let totalProcessed = 0;
    let totalFailed = 0;
    const failedSamples: string[] = [];

    // 한 블로거 처리 (병렬 실행 단위)
    const processOne = async (blogId: string) => {
      try {
        const visitors = await fetchBlogVisitors(blogId);
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
        const avg7d = visitors.slice(-7).reduce((s, v) => s + v.visitors, 0) / Math.min(visitors.length, 7);
        const avg30d = visitors.reduce((s, v) => s + v.visitors, 0) / visitors.length;
        const trend = avg30d > 0 ? ((avg7d - avg30d) / avg30d) * 100 : 0;

        await supabase
          .from('blog_scores')
          .upsert({
            blog_id: blogId,
            latest_visitors: latest.visitors,
            visitor_trend: Math.round(trend * 100) / 100,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'blog_id' });

        totalProcessed++;
      } catch (err) {
        console.error(`[crawl-blog-visitors] Error for ${blogId}:`, err);
        totalFailed++;
        if (failedSamples.length < 20) failedSamples.push(blogId);
      }
    };

    // CONCURRENCY 만큼 병렬 처리
    for (let i = 0; i < blogIds.length; i += CONCURRENCY) {
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
