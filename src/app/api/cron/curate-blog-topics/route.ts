import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU, parseJsonArrayFromClaudeText } from '@/lib/claude-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:curate-blog-topics';
const CRON_LOCK_TTL_SECONDS = 660;
const TIME_BUDGET_MS = 270_000;
// 프롬프트 토큰 예산 + 비용 통제 — 유저당 1회 실행에 분류할 신규 글 상한
const MAX_NEW_POSTS_PER_USER = 40;

const TOPIC_TYPES = ['genre', 'author', 'publisher', 'brand', 'business', 'region', 'keyword'] as const;
type TopicType = (typeof TOPIC_TYPES)[number];

type SupabaseClient = ReturnType<typeof createServiceClient>;

interface Target {
  userId: string;
  blogId: string;
}

interface Assignment {
  postId: string;
  topicType: TopicType;
  topicName: string;
  keywords: string[];
  confidence: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** analyze-topic-insights와 동일한 조건(INFLUENCER 플랜 활성) → 본인 blog_id만 대상 */
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

/** blog_post_contents.published_at은 "2026. 8. 1." 또는 "2026. 8. 1. 14:23" 형식의 비표준 원문 문자열 */
function parsePostDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function classifyPosts(
  anthropic: Anthropic,
  posts: { post_id: string; title: string | null; category: string | null; tags: string[]; content_excerpt: string | null }[],
  existingTopics: { topicType: TopicType; name: string; keywords: string[] }[],
): Promise<Assignment[] | null> {
  try {
    const postLines = posts
      .map(p => `- [${p.post_id}] ${p.title || '(제목 없음)'} | 카테고리:${p.category || '-'} | 태그:${(p.tags || []).join(',') || '-'} | 발췌:${(p.content_excerpt || '').slice(0, 150)}`)
      .join('\n');

    const existingByType = new Map<TopicType, string[]>();
    for (const t of existingTopics) {
      const list = existingByType.get(t.topicType) || [];
      list.push(`${t.name}(키워드:${t.keywords.join(',') || '-'})`);
      existingByType.set(t.topicType, list);
    }
    const existingLines = TOPIC_TYPES.map(
      type => `[${type}] ${(existingByType.get(type) || []).join(' / ') || '(없음)'}`,
    ).join('\n');

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 4000,
      system: `당신은 네이버 인플루언서 블로그의 신규 글을 분석해 "토픽"(콘텐츠 전문 분야)으로 자동 분류하는 분석가입니다.

토픽은 아래 7개 유형(topicType) 중 해당하는 것에만 분류합니다. 한 글이 여러 유형에 동시에 속할 수 있습니다(예: 도서 리뷰 글은 genre + author 둘 다).
- genre: 장르/분야 대분류 (예: 소설, 자기계발, 육아, 여행, 뷰티)
- author: 인물명 (작가, 셰프, 크리에이터 등 글의 중심 인물)
- publisher: 출판사/제작사/브랜드사 등 발행 주체
- brand: 제품/브랜드명
- business: 매장/업체/서비스명
- region: 지역명
- keyword: 위 6개에 속하지 않지만 반복적으로 다루는 주제/키워드

이미 존재하는 토픽 목록(유형별):
${existingLines}

신규 글 목록 (총 ${posts.length}개):
${postLines}

임무:
1. 각 글에 대해 확신할 수 있는 유형에만 토픽을 배정하세요. 애매하면 배정하지 마세요(모든 글을 억지로 분류할 필요 없음).
2. 이미 존재하는 토픽 목록의 이름과 의미가 같다면 반드시 그 이름을 정확히 그대로 사용하세요(새 이름 금지, 오탈자·띄어쓰기까지 동일하게).
3. 기존 목록에 없는 새로운 주제라면 짧은 한국어 명사구로 새 이름을 만드세요.

아래 형식의 JSON 배열만 반환하세요 (코드블록, 마크다운 없이 순수 JSON):
[
  {
    "postId": "글 목록의 [id] 값",
    "topicType": "genre|author|publisher|brand|business|region|keyword 중 하나",
    "topicName": "토픽명",
    "keywords": ["대표 키워드", "..."],
    "confidence": 0.0~1.0 사이 숫자
  }
]`,
      messages: [{ role: 'user', content: '위 지침에 따라 분류 결과 JSON 배열만 반환하세요.' }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const parsed = parseJsonArrayFromClaudeText<unknown>(rawText);
    if (!Array.isArray(parsed)) return null;

    const validPostIds = new Set(posts.map(p => p.post_id));
    return (parsed as Record<string, unknown>[])
      .map((a): Assignment | null => {
        const postId = typeof a.postId === 'string' ? a.postId : '';
        const topicType = typeof a.topicType === 'string' ? (a.topicType as TopicType) : null;
        const topicName = typeof a.topicName === 'string' ? a.topicName.trim() : '';
        if (!postId || !validPostIds.has(postId)) return null;
        if (!topicType || !TOPIC_TYPES.includes(topicType)) return null;
        if (!topicName) return null;
        const keywords = Array.isArray(a.keywords) ? a.keywords.filter((k): k is string => typeof k === 'string').slice(0, 10) : [];
        const confidence = typeof a.confidence === 'number' && a.confidence >= 0 && a.confidence <= 1 ? a.confidence : 0.6;
        return { postId, topicType, topicName, keywords, confidence };
      })
      .filter((a): a is Assignment => a !== null);
  } catch (err) {
    console.error('[curate-blog-topics] classify error:', err);
    return null;
  }
}

/** topic_posts에 실제로 걸린 글들의 조회수/발행일을 다시 읽어 topics 집계 컬럼을 재계산 (증분 산술 대신 항상 재계산해 드리프트 방지) */
async function recomputeTopicAggregate(supabase: SupabaseClient, userId: string, topicId: string) {
  const { data: links } = await supabase.from('topic_posts').select('post_id, relevance_score').eq('topic_id', topicId);
  const postIds = (links || []).map(l => l.post_id as string);
  if (postIds.length === 0) return;

  const { data: contents } = await supabase
    .from('blog_post_contents')
    .select('post_id, view_count, published_at')
    .eq('user_id', userId)
    .in('post_id', postIds);

  let totalViewCount = 0;
  let firstPostAt: Date | null = null;
  let lastPostAt: Date | null = null;
  for (const c of contents || []) {
    totalViewCount += c.view_count || 0;
    const d = parsePostDate(c.published_at as string | null);
    if (d) {
      if (!firstPostAt || d < firstPostAt) firstPostAt = d;
      if (!lastPostAt || d > lastPostAt) lastPostAt = d;
    }
  }
  const scores = (links || []).map(l => Number(l.relevance_score) || 0);
  const confidence = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  await supabase
    .from('topics')
    .update({
      post_count: postIds.length,
      total_view_count: totalViewCount,
      confidence,
      first_post_at: firstPostAt ? firstPostAt.toISOString() : null,
      last_post_at: lastPostAt ? lastPostAt.toISOString() : null,
    })
    .eq('id', topicId);
}

async function curateForUser(supabase: SupabaseClient, anthropic: Anthropic, target: Target) {
  const { userId, blogId } = target;

  const [{ data: alreadyLinked }, { data: alreadyCandidate }] = await Promise.all([
    supabase.from('topic_posts').select('post_id').eq('user_id', userId),
    supabase.from('topic_candidates').select('post_id').eq('user_id', userId),
  ]);
  const seenPostIds = new Set<string>([
    ...(alreadyLinked || []).map(r => r.post_id as string),
    ...(alreadyCandidate || []).map(r => r.post_id as string),
  ]);

  const { data: allPosts } = await supabase
    .from('blog_post_contents')
    .select('post_id, title, category, tags, content_excerpt')
    .eq('user_id', userId)
    .eq('blog_id', blogId)
    .order('published_at', { ascending: false });
  const newPosts = (allPosts || []).filter(p => !seenPostIds.has(p.post_id as string)).slice(0, MAX_NEW_POSTS_PER_USER);
  if (newPosts.length === 0) return { classified: 0 };

  const { data: existingTopicsRows } = await supabase
    .from('topics')
    .select('id, topic_type, name, representative_keywords')
    .eq('user_id', userId)
    .eq('blog_id', blogId);
  const existingTopics = (existingTopicsRows || []).map(t => ({
    id: t.id as string,
    topicType: t.topic_type as TopicType,
    name: t.name as string,
    keywords: (t.representative_keywords as string[]) || [],
  }));
  const existingTopicByKey = new Map(existingTopics.map(t => [`${t.topicType}|${t.name}`, t]));

  const assignments = await classifyPosts(anthropic, newPosts, existingTopics);
  if (!assignments || assignments.length === 0) return { classified: newPosts.length };

  // 같은 (유형,이름) 묶음별로 처리
  const groups = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = `${a.topicType}|${a.topicName}`;
    const list = groups.get(key) || [];
    list.push(a);
    groups.set(key, list);
  }

  const touchedTopicIds = new Set<string>();

  for (const [key, group] of groups) {
    const existing = existingTopicByKey.get(key);

    if (existing) {
      await supabase.from('topic_posts').upsert(
        group.map(a => ({ topic_id: existing.id, user_id: userId, post_id: a.postId, relevance_score: a.confidence })),
        { onConflict: 'topic_id,post_id' },
      );
      touchedTopicIds.add(existing.id);
      continue;
    }

    // 신규 주제 — 기존 후보(topic_candidates)와 이번 배치를 합쳐 2개 이상이면 토픽 생성, 아니면 후보로만 적재
    const { data: existingCandidates } = await supabase
      .from('topic_candidates')
      .select('post_id')
      .eq('user_id', userId)
      .eq('blog_id', blogId)
      .eq('topic_type', group[0].topicType)
      .eq('suggested_name', group[0].topicName);
    const candidatePostIds = new Set((existingCandidates || []).map(c => c.post_id as string));
    const groupPostIds = new Set(group.map(a => a.postId));
    const allPostIds = new Set<string>([...candidatePostIds, ...groupPostIds]);

    if (allPostIds.size < 2) {
      await supabase.from('topic_candidates').upsert(
        group.map(a => ({ user_id: userId, blog_id: blogId, post_id: a.postId, topic_type: a.topicType, suggested_name: a.topicName })),
        { onConflict: 'user_id,post_id,topic_type,suggested_name' },
      );
      continue;
    }

    const keywords = Array.from(new Set(group.flatMap(a => a.keywords))).slice(0, 10);
    const { data: created, error: createError } = await supabase
      .from('topics')
      .upsert(
        { user_id: userId, blog_id: blogId, topic_type: group[0].topicType, name: group[0].topicName, representative_keywords: keywords },
        { onConflict: 'user_id,blog_id,topic_type,name' },
      )
      .select('id')
      .single();
    if (createError || !created) {
      console.error('[curate-blog-topics] topic create failed:', createError?.message);
      continue;
    }

    const confidenceByPostId = new Map(group.map(a => [a.postId, a.confidence]));
    await supabase.from('topic_posts').upsert(
      Array.from(allPostIds).map(postId => ({
        topic_id: created.id,
        user_id: userId,
        post_id: postId,
        relevance_score: confidenceByPostId.get(postId) ?? 0.6,
      })),
      { onConflict: 'topic_id,post_id' },
    );
    await supabase
      .from('topic_candidates')
      .delete()
      .eq('user_id', userId)
      .eq('blog_id', blogId)
      .eq('topic_type', group[0].topicType)
      .eq('suggested_name', group[0].topicName);

    touchedTopicIds.add(created.id as string);
  }

  for (const topicId of touchedTopicIds) {
    await recomputeTopicAggregate(supabase, userId, topicId);
  }

  return { classified: newPosts.length };
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
  const jobId = await createCrawlJob('curate-blog-topics');
  const supabase = createServiceClient();

  let totalUsers = 0;
  let totalFailed = 0;
  let totalClassified = 0;

  try {
    const targets = await resolveTargets(supabase);

    for (const target of targets) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      totalUsers++;

      try {
        const { classified } = await curateForUser(supabase, anthropic, target);
        totalClassified += classified;
      } catch (err) {
        totalFailed++;
        console.error(`[curate-blog-topics] user ${target.userId} (${target.blogId}) failed:`, err);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalUsers,
      processed_items: totalUsers - totalFailed,
      failed_items: totalFailed,
    });

    return NextResponse.json({ success: true, users: totalUsers, failed: totalFailed, classified: totalClassified });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[curate-blog-topics] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
