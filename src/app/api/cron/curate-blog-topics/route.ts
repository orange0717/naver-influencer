import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { fetchAllBlogPosts } from '@/lib/blog-posts-fetcher';
import { extractPostText } from '@/lib/blog-post-content';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:curate-blog-topics';
const CRON_LOCK_TTL_SECONDS = 660;
// Vercel maxDuration(300초)에 근접하면 남은 대상은 다음 실행으로 미룬다.
// 신규 글만 증분 분석하므로 이미 처리된 사용자는 자연히 스킵되어 안전하게 이어진다.
const TIME_BUDGET_MS = 270_000;
// 최초 백필 시 대형 블로그가 하루 만에 수백 건을 분석해 비용이 튀는 것을 방지.
// 초과분은 blog_post_contents에 없는 글로 남아 다음날 크론이 이어서 처리한다.
const PER_USER_NEW_POST_CAP = 50;
const MODEL = 'claude-haiku-4-5-20251001';

type SupabaseClient = ReturnType<typeof createServiceClient>;

interface ClassifyResult {
  entities: Record<string, string[]>;
  matchedTopics: { name: string; relevanceScore: number }[];
  suggestedNewTopics: string[];
}

function normalizeTopicName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

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

async function classifyPost(
  anthropic: Anthropic,
  post: { title: string; text: string; category?: string },
  existingTopicNames: string[],
): Promise<ClassifyResult | null> {
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: `당신은 네이버 블로그 글을 의미 단위로 분류해 "토픽"으로 그룹핑하는 분석가입니다.

목표: 같은 주제/브랜드/제품/장소/인물/시리즈 등을 공유하는 글들을 하나의 토픽으로 묶습니다.
이미 존재하는 토픽 목록이 주어지면, 새 글이 그 중 하나와 의미가 겹치는지 먼저 판단하세요.
겹치는 기존 토픽이 없을 때만 새 토픽 이름을 제안하세요(중복 생성을 최소화하기 위함).

아래 형식의 JSON만 반환하세요 (코드블록, 마크다운 없이 순수 JSON):
{
  "entities": { "인물": ["..."], "브랜드": ["..."], "장소": ["..."], "제품": ["..."] },
  "matchedTopics": [ { "name": "기존 토픽명 그대로", "relevanceScore": 0~100 } ],
  "suggestedNewTopics": ["새 토픽명"]
}

규칙:
- entities는 본문에서 실제 언급된 것만, 각 배열 최대 5개, 없으면 빈 배열
- matchedTopics는 실제로 의미가 겹치는 경우만(느슨한 연관 금지), 없으면 빈 배열
- suggestedNewTopics는 매칭된 기존 토픽이 없을 때만, 1~2개, 짧은 한국어 명사구("OO 카페 탐방" 등)
- 이미 matchedTopics에 넣은 의미로 suggestedNewTopics를 또 만들지 마세요
- 정보성/광고성 글이 아니라 개인 잡담이라 명확한 주제가 없으면 둘 다 빈 배열 가능`,
      messages: [{
        role: 'user',
        content: `기존 토픽 목록: ${existingTopicNames.length ? existingTopicNames.join(', ') : '(없음)'}\n\n카테고리: ${post.category || '(없음)'}\n제목: ${post.title}\n\n본문:\n${post.text}`,
      }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    let parsed: Partial<ClassifyResult>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      if (!m) return null;
      parsed = JSON.parse(m[0]);
    }

    return {
      entities: parsed.entities || {},
      matchedTopics: Array.isArray(parsed.matchedTopics) ? parsed.matchedTopics : [],
      suggestedNewTopics: Array.isArray(parsed.suggestedNewTopics) ? parsed.suggestedNewTopics : [],
    };
  } catch (err) {
    console.error('[curate-blog-topics] classify error:', err);
    return null;
  }
}

/** 토픽에 연결된 글들을 기준으로 post_count/total_view_count/thumbnail_url/score를 재계산 */
async function refreshTopicAggregates(supabase: SupabaseClient, topicId: string) {
  const { data: topic } = await supabase.from('blog_topics').select('user_id').eq('id', topicId).maybeSingle();
  if (!topic) return;

  const { data: links } = await supabase
    .from('blog_topic_posts')
    .select('post_id')
    .eq('topic_id', topicId);
  const postIds = (links || []).map(l => l.post_id);
  if (postIds.length === 0) return;

  const { data: contents } = await supabase
    .from('blog_post_contents')
    .select('view_count, thumbnail_url')
    .eq('user_id', topic.user_id)
    .in('post_id', postIds);
  const rows = contents || [];

  const totalViewCount = rows.reduce((sum, r) => sum + (r.view_count || 0), 0);
  const withThumb = [...rows].filter(r => r.thumbnail_url).sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  const thumbnailUrl = withThumb[0]?.thumbnail_url || null;
  const postCount = postIds.length;
  const score = totalViewCount + postCount * 100;

  await supabase
    .from('blog_topics')
    .update({
      post_count: postCount,
      total_view_count: totalViewCount,
      thumbnail_url: thumbnailUrl,
      score,
      last_post_at: new Date().toISOString(),
    })
    .eq('id', topicId);
}

/**
 * 매일 자동 실행 — INFLUENCER 플랜 활성 사용자의 블로그 신규 글을 증분 분석해
 * Claude 프롬프트 기반으로 의미 단위 토픽 그룹핑을 수행한다.
 * GET /api/cron/curate-blog-topics
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('curate-blog-topics');
  const supabase = createServiceClient();
  const anthropic = new Anthropic({ apiKey });

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

        const { data: existingTopics } = await supabase
          .from('blog_topics')
          .select('id, name')
          .eq('user_id', userId)
          .eq('blog_id', blogId);
        const topicIdByName = new Map<string, string>();
        for (const t of existingTopics || []) topicIdByName.set(normalizeTopicName(t.name), t.id);

        for (const post of newPosts) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) break;

          try {
            const { title, text, charCount, thumbnailUrl } = await extractPostText(blogId, post.id);
            if (charCount < 100) {
              await sleep(300);
              continue;
            }

            const classified = await classifyPost(
              anthropic,
              { title: title || post.title, text, category: post.category },
              Array.from(topicIdByName.keys()),
            );

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
                entities: classified?.entities || {},
              },
              { onConflict: 'user_id,post_id' },
            );
            totalNewPosts++;

            if (classified) {
              for (const match of classified.matchedTopics) {
                const key = normalizeTopicName(match.name);
                const topicId = topicIdByName.get(key);
                if (!topicId) continue;
                await supabase.from('blog_topic_posts').upsert(
                  { topic_id: topicId, user_id: userId, post_id: post.id, relevance_score: match.relevanceScore ?? 0 },
                  { onConflict: 'topic_id,post_id' },
                );
                await refreshTopicAggregates(supabase, topicId);
              }

              for (const suggestion of classified.suggestedNewTopics) {
                const key = normalizeTopicName(suggestion);
                if (!key || topicIdByName.has(key)) continue;

                const { data: otherCandidates } = await supabase
                  .from('blog_topic_candidates')
                  .select('id, post_id')
                  .eq('user_id', userId)
                  .eq('blog_id', blogId)
                  .eq('suggested_topic_name', key);
                const otherPost = (otherCandidates || []).find(c => c.post_id !== post.id);

                if (otherPost) {
                  // 같은 이름의 후보가 다른 글에서도 나왔다 — 실제 토픽으로 승격
                  const { data: newTopic, error: topicErr } = await supabase
                    .from('blog_topics')
                    .upsert(
                      { user_id: userId, blog_id: blogId, name: key },
                      { onConflict: 'user_id,blog_id,name' },
                    )
                    .select('id')
                    .single();

                  if (!topicErr && newTopic) {
                    await supabase.from('blog_topic_posts').upsert(
                      [
                        { topic_id: newTopic.id, user_id: userId, post_id: post.id, relevance_score: 80 },
                        { topic_id: newTopic.id, user_id: userId, post_id: otherPost.post_id, relevance_score: 80 },
                      ],
                      { onConflict: 'topic_id,post_id' },
                    );
                    await supabase
                      .from('blog_topic_candidates')
                      .delete()
                      .eq('user_id', userId)
                      .eq('blog_id', blogId)
                      .eq('suggested_topic_name', key);
                    await refreshTopicAggregates(supabase, newTopic.id);
                    topicIdByName.set(key, newTopic.id);
                  }
                } else {
                  await supabase.from('blog_topic_candidates').upsert(
                    { user_id: userId, blog_id: blogId, post_id: post.id, suggested_topic_name: key },
                    { onConflict: 'user_id,post_id,suggested_topic_name' },
                  );
                }
              }
            }
          } catch (postErr) {
            totalFailed++;
            console.error(`[curate-blog-topics] post ${blogId}/${post.id} failed:`, postErr);
          }

          await sleep(500);
        }
      } catch (userErr) {
        totalFailed++;
        console.error(`[curate-blog-topics] user ${userId} (${blogId}) failed:`, userErr);
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
    console.error('[curate-blog-topics] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
