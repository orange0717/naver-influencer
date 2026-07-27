import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import {
  NAVER_DOMAIN_CATEGORIES,
  fetchInfluencerTopicCards,
  fetchTopicDetail,
  fetchDiscoverCategory,
} from '@/lib/naver-topic-crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:crawl-naver-topics';
const CRON_LOCK_TTL_SECONDS = 660;
const TIME_BUDGET_MS = 270_000;

type SupabaseClient = ReturnType<typeof createServiceClient>;

interface CrawlTarget {
  userId: string;
  blogId: string;
  isOwnBlog: boolean;
}

/** 매일 자동 실행 대상 순회 순서를 섞어, 시간 예산 초과로 뒤쪽 대상이 항상 후순위로 밀리는 것을 완화 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** curate-blog-topics와 동일한 조건(INFLUENCER 플랜 활성)의 유저 → 본인 블로그 + competitor_watches 경쟁자 naver_id */
async function resolveTargets(supabase: SupabaseClient): Promise<CrawlTarget[]> {
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, blog_id, linked_influencer_id, subscription_plan, subscription_expires_at')
    .eq('subscription_plan', 'INFLUENCER');
  if (usersError) throw usersError;

  const activeUsers = (users || []).filter(
    u => u.subscription_expires_at && new Date(u.subscription_expires_at).getTime() > Date.now(),
  );

  const influencerIds = Array.from(
    new Set(activeUsers.filter(u => !u.blog_id && u.linked_influencer_id).map(u => u.linked_influencer_id as string)),
  );
  const naverIdByInfluencerId = new Map<string, string>();
  if (influencerIds.length > 0) {
    const { data: infs } = await supabase.from('influencers').select('id, naver_id').in('id', influencerIds);
    for (const inf of infs || []) {
      if (inf.naver_id) naverIdByInfluencerId.set(inf.id, inf.naver_id);
    }
  }

  const targets: CrawlTarget[] = [];
  const userIds = activeUsers.map(u => u.id as string);

  const ownBlogByUserId = new Map<string, string>();
  for (const u of activeUsers) {
    const naverId = (u.blog_id || naverIdByInfluencerId.get(u.linked_influencer_id || '') || '').trim();
    if (naverId) {
      ownBlogByUserId.set(u.id as string, naverId);
      targets.push({ userId: u.id as string, blogId: naverId, isOwnBlog: true });
    }
  }

  if (userIds.length > 0) {
    const { data: watches } = await supabase
      .from('competitor_watches')
      .select('user_id, influencers!competitor_id(naver_id)')
      .in('user_id', userIds);
    for (const w of watches || []) {
      const inf = w.influencers as unknown as { naver_id: string } | null;
      const naverId = inf?.naver_id?.trim();
      if (!naverId) continue;
      if (naverId === ownBlogByUserId.get(w.user_id as string)) continue;
      targets.push({ userId: w.user_id as string, blogId: naverId, isOwnBlog: false });
    }
  }

  return targets;
}

async function upsertTopic(supabase: SupabaseClient, target: CrawlTarget, card: Awaited<ReturnType<typeof fetchInfluencerTopicCards>>['items'][number]) {
  const { data: topicRow, error } = await supabase
    .from('naver_influencer_topics')
    .upsert(
      {
        user_id: target.userId,
        blog_id: target.blogId,
        topic_id: card.topicId,
        is_own_blog: target.isOwnBlog,
        title: card.title,
        thumbnail_url: card.thumbnailUrl,
        content_count: card.contentCount,
        introduction: card.introduction,
        topic_subject: card.topicSubject,
        topic_subject_category: card.topicSubjectCategory,
        topic_subject_category_id: card.topicSubjectCategoryId,
        naver_created_at: card.createdAt,
        naver_modified_at: card.modifiedAt,
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,blog_id,topic_id' },
    )
    .select('id')
    .single();

  if (error || !topicRow) {
    console.error('[crawl-naver-topics] upsert topic failed:', error?.message);
    return null;
  }
  return topicRow.id as string;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('crawl-naver-topics');
  const supabase = createServiceClient();

  let totalTargets = 0;
  let totalTopics = 0;
  let totalFailed = 0;

  try {
    const targets = shuffle(await resolveTargets(supabase));

    for (const target of targets) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      totalTargets++;

      try {
        const { items } = await fetchInfluencerTopicCards(target.blogId);

        const { data: existingRows } = await supabase
          .from('naver_influencer_topics')
          .select('topic_id, naver_modified_at, naver_created_at')
          .eq('user_id', target.userId)
          .eq('blog_id', target.blogId);
        const existingByTopicId = new Map((existingRows || []).map(r => [r.topic_id, r]));

        for (const card of items) {
          const existing = existingByTopicId.get(card.topicId);
          const isNew = !existing;
          const isChanged =
            !!existing && (card.modifiedAt || card.createdAt) !== (existing.naver_modified_at || existing.naver_created_at);
          if (!isNew && !isChanged) continue;

          const topicPk = await upsertTopic(supabase, target, card);
          if (!topicPk) { totalFailed++; continue; }
          totalTopics++;

          const detail = await fetchTopicDetail(target.blogId, card.topicId);
          if (detail && detail.posts.length > 0) {
            await supabase.from('naver_influencer_topic_posts').upsert(
              detail.posts.map(p => ({
                topic_pk: topicPk,
                content_id: p.contentId,
                title: p.title,
                intro_body: p.introBody,
                tags: detail.tags,
              })),
              { onConflict: 'topic_pk,content_id' },
            );
          }
          await sleep(300);
        }
      } catch (err) {
        totalFailed++;
        console.error(`[crawl-naver-topics] target failed (${target.blogId}):`, err);
      }

      await sleep(300);
    }

    // Discover 스냅샷 — 20개 도메인, 1일 1회 (snapshot_date UNIQUE 제약으로 중복 실행 방지)
    const today = new Date().toISOString().slice(0, 10);
    for (const category of NAVER_DOMAIN_CATEGORIES) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      const { count } = await supabase
        .from('naver_discover_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', category.id)
        .eq('snapshot_date', today);
      if (count && count > 0) continue;

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
      } catch (err) {
        console.error(`[crawl-naver-topics] discover snapshot failed (${category.name}):`, err);
      }

      await sleep(300);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalTargets,
      processed_items: totalTopics,
      failed_items: totalFailed,
    });

    return NextResponse.json({ success: true, totalTargets, totalTopics, totalFailed });
  } catch (err) {
    console.error('[crawl-naver-topics] fatal error:', err);
    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: '크론 실행 실패' }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
