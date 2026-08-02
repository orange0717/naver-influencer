import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { fetchAllBlogPosts } from '@/lib/blog-posts-fetcher';
import { extractPostText } from '@/lib/blog-post-content';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:scrape-blog-posts';
const CRON_LOCK_TTL_SECONDS = 660;
// Vercel maxDuration(300초)에 근접하면 남은 대상은 다음 실행으로 미룬다.
// 신규 글만 증분 스크래핑하므로 이미 처리된 사용자는 자연히 스킵되어 안전하게 이어진다.
const TIME_BUDGET_MS = 270_000;
// 최초 백필 시 대형 블로그가 하루 만에 수백 건을 스크래핑하는 것을 방지.
// 초과분은 blog_post_contents에 없는 글로 남아 다음날 크론이 이어서 처리한다.
const PER_USER_NEW_POST_CAP = 50;

/** 사용자 순회 순서를 매 실행마다 섞어, 시간 예산 초과로 뒤쪽 사용자가
 *  영원히 후순위로 밀리는 것(aggregate-influencers에서 겪었던 구조적 결함)을 완화한다. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 매일 자동 실행 — INFLUENCER 플랜 활성 사용자의 블로그 신규 글을 증분 스크래핑해
 * blog_post_contents에 저장한다(제목/본문 발췌/카테고리/썸네일/조회수/발행일). AI 분류는 하지 않음 —
 * /api/blog/topics가 여기 저장된 category(네이버 블로그 자체 카테고리)를 그대로 라이브 집계해 보여준다.
 * GET /api/cron/scrape-blog-posts
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('scrape-blog-posts');
  const supabase = createServiceClient();

  let totalUsers = 0;
  let totalNewPosts = 0;
  let totalFailed = 0;

  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, blog_id, linked_influencer_id, subscription_plan, subscription_expires_at')
      .eq('subscription_plan', 'INFLUENCER');
    if (usersError) throw usersError;

    const activeUsers = (users || []).filter(
      u => u.subscription_expires_at && new Date(u.subscription_expires_at).getTime() > Date.now(),
    );

    const influencerIds = Array.from(
      new Set(
        activeUsers
          .filter(u => !u.blog_id && u.linked_influencer_id)
          .map(u => u.linked_influencer_id as string),
      ),
    );
    const influencerNaverIdMap = new Map<string, string>();
    if (influencerIds.length > 0) {
      const { data: infs } = await supabase.from('influencers').select('id, naver_id').in('id', influencerIds);
      for (const inf of infs || []) {
        if (inf.naver_id) influencerNaverIdMap.set(inf.id, inf.naver_id);
      }
    }

    const targets = shuffle(activeUsers)
      .map(u => ({
        userId: u.id as string,
        blogId: (u.blog_id || influencerNaverIdMap.get(u.linked_influencer_id || '') || '').trim(),
      }))
      .filter(t => t.blogId);

    for (const { userId, blogId } of targets) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      totalUsers++;

      try {
        const posts = await fetchAllBlogPosts(blogId);
        if (posts.length === 0) continue;

        const { data: existingContents } = await supabase
          .from('blog_post_contents')
          .select('post_id')
          .eq('user_id', userId);
        const existingIds = new Set((existingContents || []).map(c => c.post_id));
        const newPosts = posts.filter(p => !existingIds.has(p.id)).slice(0, PER_USER_NEW_POST_CAP);
        if (newPosts.length === 0) continue;

        for (const post of newPosts) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) break;

          try {
            const { title, text, charCount, thumbnailUrl } = await extractPostText(blogId, post.id);
            if (charCount < 100) {
              await sleep(300);
              continue;
            }

            await supabase.from('blog_post_contents').upsert(
              {
                user_id: userId,
                blog_id: blogId,
                post_id: post.id,
                title: title || post.title,
                content_excerpt: text,
                category: post.category || null,
                thumbnail_url: thumbnailUrl,
                view_count: post.viewCount,
                published_at: post.date,
              },
              { onConflict: 'user_id,post_id' },
            );
            totalNewPosts++;
          } catch (postErr) {
            totalFailed++;
            console.error(`[scrape-blog-posts] post ${blogId}/${post.id} failed:`, postErr);
          }

          await sleep(300);
        }
      } catch (userErr) {
        totalFailed++;
        console.error(`[scrape-blog-posts] user ${userId} (${blogId}) failed:`, userErr);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalUsers,
      processed_items: totalNewPosts,
      failed_items: totalFailed,
    });

    return NextResponse.json({ success: true, users: totalUsers, newPosts: totalNewPosts, failed: totalFailed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scrape-blog-posts] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
