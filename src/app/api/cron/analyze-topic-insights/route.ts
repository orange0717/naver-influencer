import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU, parseJsonArrayFromClaudeText, UNTRUSTED_DATA_NOTICE, wrapUntrusted } from '@/lib/claude-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:analyze-topic-insights';
const CRON_LOCK_TTL_SECONDS = 660;
const TIME_BUDGET_MS = 270_000;
// 프롬프트 토큰 예산 통제 — 대형 블로그도 최근 글 위주로만 분석
const MAX_POSTS_PER_USER = 300;

type SupabaseClient = ReturnType<typeof createServiceClient>;

interface ClusterResult {
  name: string;
  category: string | null;
  keywords: string[];
  matchedPostIds: string[];
  alreadyPublished: boolean;
  matchedExistingTitle: string | null;
  reasoning: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Target {
  userId: string;
  blogId: string;
}

/** curate-blog-topics와 동일한 조건(Max 플랜 활성)의 유저 → 본인 blog_id */
async function resolveTargets(supabase: SupabaseClient): Promise<Target[]> {
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

  return shuffle(activeUsers)
    .map(u => ({
      userId: u.id as string,
      blogId: (u.blog_id || naverIdByInfluencerId.get(u.linked_influencer_id || '') || '').trim(),
    }))
    .filter(t => t.blogId);
}

async function analyzeClusters(
  anthropic: Anthropic,
  posts: { post_id: string; title: string | null; category: string | null; tags: string[]; content_excerpt: string | null }[],
  publishedTopics: { title: string | null; topic_subject: string | null; topic_subject_category: string | null }[],
): Promise<ClusterResult[] | null> {
  try {
    const postLines = posts
      .map(p => `- [${p.post_id}] ${p.title || '(제목 없음)'} | 카테고리:${p.category || '-'} | 태그:${(p.tags || []).join(',') || '-'} | 발췌:${(p.content_excerpt || '').slice(0, 150)}`)
      .join('\n');
    const publishedLines = publishedTopics.length
      ? publishedTopics.map(t => `- ${t.title || '(제목 없음)'} (${t.topic_subject_category || t.topic_subject || '분류 없음'})`).join('\n')
      : '(없음)';

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 4000,
      system: `당신은 네이버 인플루언서 블로그 글 목록을 분석해 "토픽"(같은 주제를 다루는 글 묶음, 최소 2개 이상 글)을 찾아내는 분석가입니다.

이미 네이버에 발행된 토픽 목록이 함께 주어집니다. 당신의 임무:
1. 블로그 글 목록 전체를 의미 단위로 재검토해, 토픽으로 묶일 수 있는 모든 클러스터를 찾습니다(발행 여부와 무관하게 전부).
2. 이미 발행된 토픽과 크게 겹치는 클러스터는 "alreadyPublished": true로 표시하고 matchedExistingTitle에 해당 발행 토픽 제목을 적습니다.
3. 발행된 토픽에 없는 새로운 클러스터는 "alreadyPublished": false로 표시합니다. 특히 이미 발행된 토픽이 다루는 주제보다 더 세분화된 하위 주제(예: "수도배관" 발행 토픽이 있어도 그 안의 글들을 다시 보면 "녹물", "누수 사례", "공사비" 등 더 좁은 하위 토픽으로 나뉠 수 있음)가 있다면 적극적으로 찾아내 별도 클러스터로 제안하세요.
4. 최소 2개 이상의 글이 모여야 하나의 클러스터입니다.

아래 형식의 JSON 배열만 반환하세요 (코드블록, 마크다운 없이 순수 JSON):
[
  {
    "name": "클러스터명(짧은 한국어 명사구)",
    "category": "여행/요리/뷰티 등 대표 도메인 한 단어 (모르면 null)",
    "keywords": ["대표 키워드", "..."],
    "matchedPostIds": ["글 목록의 [id] 값들"],
    "alreadyPublished": true 또는 false,
    "matchedExistingTitle": "겹치는 발행 토픽 제목 또는 null",
    "reasoning": "왜 이 클러스터로 묶었는지 한 문장"
  }
]

규칙:
- matchedPostIds는 반드시 글 목록에 주어진 실제 [id] 값만 사용
- 정보성 없는 잡담 글은 어떤 클러스터에도 넣지 않아도 됨
- 클러스터 개수 상한 없음 — 찾을 수 있는 만큼 모두 반환

${UNTRUSTED_DATA_NOTICE}`,
      messages: [{
        role: 'user',
        content: `이미 발행된 토픽 목록:\n${wrapUntrusted(publishedLines, 'published_topics')}\n\n블로그 글 목록 (총 ${posts.length}개):\n${wrapUntrusted(postLines, 'naver_blog_posts')}`,
      }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const parsed = parseJsonArrayFromClaudeText<unknown>(rawText);
    if (!Array.isArray(parsed)) return null;

    return parsed.map((c: Record<string, unknown>) => ({
      name: typeof c.name === 'string' ? c.name.trim() : '',
      category: typeof c.category === 'string' ? c.category : null,
      keywords: Array.isArray(c.keywords) ? c.keywords.filter((k): k is string => typeof k === 'string') : [],
      matchedPostIds: Array.isArray(c.matchedPostIds) ? c.matchedPostIds.filter((k): k is string => typeof k === 'string') : [],
      alreadyPublished: c.alreadyPublished === true,
      matchedExistingTitle: typeof c.matchedExistingTitle === 'string' ? c.matchedExistingTitle : null,
      reasoning: typeof c.reasoning === 'string' ? c.reasoning : '',
    })).filter(c => c.name);
  } catch (err) {
    console.error('[analyze-topic-insights] classify error:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let anthropic: Anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('analyze-topic-insights');
  const supabase = createServiceClient();

  let totalUsers = 0;
  let totalFailed = 0;

  try {
    const targets = await resolveTargets(supabase);

    for (const { userId, blogId } of targets) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      totalUsers++;

      try {
        const { data: postsData, error: postsError } = await supabase
          .from('blog_post_contents')
          .select('post_id, title, category, tags, content_excerpt')
          .eq('user_id', userId)
          .order('published_at', { ascending: false })
          .limit(MAX_POSTS_PER_USER);
        const posts = postsData || [];

        // ⚠️ blog_id 로 거르지 않는다. 인플루언서 홈 핸들과 블로그 아이디가 다른 계정에서는
        //    (orangelibrary vs orangelibrary_ — 2026-08-28 실측) 이 필터 때문에 발행 토픽 20개가
        //    0개로 집계됐고, 화면에는 "전체 토픽 0 · 활용률 0%"라는 **거짓 성적표**가 찍혔다.
        //    바로 아래 목록을 그리는 /api/naver-topics 는 user_id + is_own_blog 로만 세므로 기준을 맞춘다.
        const { data: publishedTopics, error: publishedError } = await supabase
          .from('naver_influencer_topics')
          .select('title, topic_subject, topic_subject_category')
          .eq('user_id', userId)
          .eq('is_own_blog', true);
        const myTopicCount = (publishedTopics || []).length;

        // ⚠️ 조회가 실패했는데 그 자리에 0 을 적어 저장하면 "재지 못했다"가 "0개였다"로 굳는다.
        //    확인 불가는 0 이 아니다 — 이번 차례는 통째로 건너뛰고 이전 집계를 그대로 남긴다.
        if (postsError || publishedError) {
          totalFailed++;
          console.error({
            cron: 'analyze-topic-insights', userId, blogId,
            step: postsError ? 'blog_post_contents' : 'naver_influencer_topics',
            error: postsError || publishedError,
          });
          continue;
        }

        // 경쟁 집계 — Claude 호출과 무관, 순수 SQL 집계
        const { data: watches } = await supabase
          .from('competitor_watches')
          .select('influencers!competitor_id(naver_id)')
          .eq('user_id', userId);
        const competitorNaverIds = Array.from(
          new Set(
            (watches || [])
              .map(w => (w.influencers as unknown as { naver_id: string } | null)?.naver_id?.trim())
              .filter((id): id is string => !!id && id !== blogId),
          ),
        );

        let competitorCount = 0;
        let competitorAvg: number | null = null;
        let competitorTop: number | null = null;
        if (competitorNaverIds.length > 0) {
          const { data: competitorTopics } = await supabase
            .from('naver_influencer_topics')
            .select('blog_id')
            .eq('user_id', userId)
            .eq('is_own_blog', false)
            .in('blog_id', competitorNaverIds);
          const countByBlog = new Map<string, number>();
          for (const row of competitorTopics || []) {
            countByBlog.set(row.blog_id, (countByBlog.get(row.blog_id) || 0) + 1);
          }
          // 등록은 했지만 아직 토픽이 하나도 수집되지 않은 경쟁자도 0개로 포함
          for (const id of competitorNaverIds) if (!countByBlog.has(id)) countByBlog.set(id, 0);
          const counts = Array.from(countByBlog.values());
          competitorCount = counts.length;
          if (counts.length > 0) {
            competitorAvg = counts.reduce((a, b) => a + b, 0) / counts.length;
            competitorTop = Math.max(...counts);
          }
        }

        let aiPossibleCount = myTopicCount;
        if (posts.length > 0) {
          const clusters = await analyzeClusters(anthropic, posts, publishedTopics || []);
          if (clusters) {
            aiPossibleCount = clusters.length;

            await supabase.from('topic_ai_recommendations').delete().eq('user_id', userId).eq('blog_id', blogId);

            const unpublished = clusters.filter(c => !c.alreadyPublished);
            if (unpublished.length > 0) {
              await supabase.from('topic_ai_recommendations').insert(
                unpublished.map(c => ({
                  user_id: userId,
                  blog_id: blogId,
                  suggested_name: c.name,
                  topic_subject_category: c.category,
                  representative_keywords: c.keywords,
                  matched_post_ids: c.matchedPostIds,
                  estimated_post_count: c.matchedPostIds.length,
                  reasoning: c.reasoning,
                })),
              );
            }
          }
        }

        const utilizationRate = aiPossibleCount > 0 ? Math.min(1, myTopicCount / aiPossibleCount) : 0;

        await supabase.from('topic_insight_summaries').upsert(
          {
            user_id: userId,
            blog_id: blogId,
            ai_possible_count: aiPossibleCount,
            published_count: myTopicCount,
            utilization_rate: utilizationRate,
            my_topic_count: myTopicCount,
            competitor_count: competitorCount,
            competitor_avg_topic_count: competitorAvg,
            competitor_top_topic_count: competitorTop,
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,blog_id' },
        );
      } catch (err) {
        totalFailed++;
        console.error(`[analyze-topic-insights] user ${userId} (${blogId}) failed:`, err);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalUsers,
      processed_items: totalUsers - totalFailed,
      failed_items: totalFailed,
    });

    return NextResponse.json({ success: true, users: totalUsers, failed: totalFailed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[analyze-topic-insights] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
