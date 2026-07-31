import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import { submitSitemapForUser } from '@/lib/sitemap-builder';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const RECENT_COUNT = 30;
const TIME_BUDGET_MS = 100_000;
const FIRST_CHECK_DELAY_MS = 30 * 60 * 1000;

interface WatchRow {
  user_id: string;
  blog_id: string;
  last_seen_post_no: string | null;
}

/**
 * GET /api/cron/google-indexing-auto-detect
 * auto_index_watch에서 enabled=true인 사용자의 블로그 최신 글 목록을 가져와
 * last_seen_post_no보다 새 글만 자동으로 indexed_urls에 등록한다.
 * 최초 실행(last_seen_post_no가 null)은 과거 글을 소급 등록하지 않고 커서만 설정한다.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('google-indexing-auto-detect');
  const startedAt = Date.now();

  try {
    const supabase = createServiceClient();
    const { data: watchRows, error } = await supabase
      .from('auto_index_watch')
      .select('user_id, blog_id, last_seen_post_no')
      .eq('enabled', true);

    if (error) throw new Error(error.message);

    let processed = 0;
    let registered = 0;
    let failed = 0;

    for (const watch of (watchRows ?? []) as WatchRow[]) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      try {
        const result = await fetchBlogPostList(watch.blog_id, 1, RECENT_COUNT);
        const posts = result.posts;
        if (posts.length === 0) {
          processed++;
          continue;
        }

        const lastSeen = watch.last_seen_post_no ? BigInt(watch.last_seen_post_no) : null;
        const newest = posts.reduce((max, p) => (BigInt(p.id) > BigInt(max) ? p.id : max), posts[0].id);

        if (lastSeen !== null) {
          const newPosts = posts.filter((p) => BigInt(p.id) > lastSeen);
          if (newPosts.length > 0) {
            const now = Date.now();
            const source = result.source === 'rss' ? 'rss' : 'auto_crawl';
            const rows = newPosts.map((p, i) => ({
              user_id: watch.user_id,
              blog_id: watch.blog_id,
              post_no: p.id,
              url: p.url,
              title: p.title,
              source,
              status: 'submitted',
              progress_stage: 'requesting',
              registered_at: new Date(now).toISOString(),
              next_check_at: new Date(now + FIRST_CHECK_DELAY_MS + i * 60_000).toISOString(),
              check_count: 0,
            }));
            const { error: upsertErr } = await supabase
              .from('indexed_urls')
              .upsert(rows, { onConflict: 'user_id,url', ignoreDuplicates: true });
            if (upsertErr) throw new Error(upsertErr.message);

            registered += newPosts.length;
            submitSitemapForUser(watch.user_id).catch(() => {});
          }
        }

        await supabase
          .from('auto_index_watch')
          .update({
            last_seen_post_no: newest,
            detection_method: result.source === 'rss' ? 'rss' : 'crawl',
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', watch.user_id);

        processed++;
      } catch (err) {
        failed++;
        console.error('[google-indexing-auto-detect] user failed:', watch.user_id, err instanceof Error ? err.message : err);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: watchRows?.length ?? 0,
      processed_items: processed,
      failed_items: failed,
    });

    return NextResponse.json({ success: true, total: watchRows?.length ?? 0, processed, registered, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[google-indexing-auto-detect] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
