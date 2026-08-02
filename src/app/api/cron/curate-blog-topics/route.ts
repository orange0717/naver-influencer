import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { fetchAllBlogPosts } from '@/lib/blog-posts-fetcher';
import { extractPostText } from '@/lib/blog-post-content';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU, parseJsonObjectFromClaudeText } from '@/lib/claude-client';
import { parseNaverPostDate } from '@/lib/naver-date';

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
// 이 미만 확신도의 토픽 제안은 후보로도 만들지 않는다("낮은 신뢰도 토픽 생성 안 함").
const CONFIDENCE_MIN = 0.55;
// 장르 대분류가 이 개수 이상 쌓이고 아직 소분류가 없으면 자동 세분화를 시도한다.
const SPLIT_THRESHOLD = 15;
// 세분화를 이미 한 번 시도했던 대분류는, 글 수가 마지막 체크 대비 30% 이상 늘어야 재시도한다.
const SPLIT_GROWTH_RATIO = 1.3;
const SPLIT_SAMPLE_CAP = 40;

const TOPIC_TYPES = ['genre', 'author', 'publisher', 'brand', 'business', 'region', 'keyword'] as const;
type TopicType = (typeof TOPIC_TYPES)[number];

type SupabaseClient = ReturnType<typeof createServiceClient>;

interface TopicSuggestion {
  type: TopicType;
  name: string;
  isNew: boolean;
  confidence: number;
}

interface ClassifyResult {
  topics: TopicSuggestion[];
}

interface SplitChild {
  name: string;
  postIndices: number[];
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

function topicTypeLabel(t: TopicType): string {
  switch (t) {
    case 'genre': return '장르';
    case 'author': return '작가/인물';
    case 'publisher': return '출판사/제작사';
    case 'brand': return '브랜드/제품';
    case 'business': return '업체/매장';
    case 'region': return '지역/장소';
    case 'keyword': return '핵심 키워드';
  }
}

function formatExistingTopicsByType(namesByType: Map<TopicType, Set<string>>): string {
  return TOPIC_TYPES.map(t => {
    const set = namesByType.get(t);
    return `- ${topicTypeLabel(t)}: ${set && set.size ? Array.from(set).join(', ') : '(없음)'}`;
  }).join('\n');
}

async function classifyPostIntoTopics(
  anthropic: Anthropic,
  post: { title: string; text: string; category?: string },
  namesByType: Map<TopicType, Set<string>>,
): Promise<TopicSuggestion[] | null> {
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 700,
      system: `당신은 네이버 블로그 글 하나를 여러 축(타입)으로 동시에 분류해 "토픽"을 제안하는 분석가입니다.

각 글은 아래 타입 중 실제로 해당하는 것에 한해 0~5개의 토픽에 속할 수 있습니다(같은 타입에서 최대 2개):
- genre(장르): 소설/자기계발/경제/맛집/육아 같은 콘텐츠 장르
- author(작가/인물): 본문에 실제 언급된 작가·인물명
- publisher(출판사/제작사): 본문에 실제 언급된 출판사/제작사
- brand(브랜드/제품): 본문에 실제 언급된 브랜드/제품명
- business(업체/매장): 본문에 실제 언급된 업체/매장/서비스명
- region(지역/장소): 본문에 실제 언급된 지역/동네/장소명
- keyword(핵심 키워드): 위 어디에도 안 맞지만 이 글의 핵심 주제를 나타내는 키워드(예: SEO, AEO, GEO)

기존 토픽 목록이 타입별로 주어지면, 새 글이 그 중 하나와 의미가 겹치는지 먼저 판단하세요.
동의어·표기 차이는 같은 토픽으로 취급하세요(예: "자기계발"="자기계발서"="성공학", "수도배관공사"="배관교체").
겹치는 기존 토픽이 없을 때만 새 토픽명을 제안하세요(타입별 토픽 난립 방지를 위해 최대한 재사용).

아래 JSON만 반환하세요 (코드블록, 설명 없이 순수 JSON):
{ "topics": [ { "type": "genre", "name": "토픽명", "isNew": false, "confidence": 0.0~1.0 } ] }

규칙:
- name은 짧은 한국어 명사(2~10자 권장), 기존 토픽과 매칭될 때는 기존 이름을 그대로 사용
- confidence는 이 글이 실제로 그 토픽에 속한다는 확신도(느슨한 연관은 낮게, 확실할 때만 0.8 이상)
- 명확한 주제가 없는 개인 잡담이면 topics를 빈 배열로 반환`,
      messages: [{
        role: 'user',
        content: `기존 토픽 목록(타입별):\n${formatExistingTopicsByType(namesByType)}\n\n카테고리: ${post.category || '(없음)'}\n제목: ${post.title}\n\n본문:\n${post.text}`,
      }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const parsed = parseJsonObjectFromClaudeText<Partial<ClassifyResult>>(rawText);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];

    return topics
      .filter((t): t is TopicSuggestion =>
        !!t
        && typeof t.type === 'string' && (TOPIC_TYPES as readonly string[]).includes(t.type)
        && typeof t.name === 'string' && t.name.trim().length > 0
        && typeof t.confidence === 'number')
      .map(t => ({ type: t.type, name: normalizeTopicName(t.name), isNew: !!t.isNew, confidence: t.confidence }));
  } catch (err) {
    console.error('[curate-blog-topics] classify error:', err);
    return null;
  }
}

async function splitGenreTopic(
  anthropic: Anthropic,
  rootName: string,
  posts: { title: string; excerpt: string }[],
): Promise<SplitChild[] | null> {
  if (posts.length === 0) return null;
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 1000,
      system: `당신은 네이버 블로그의 한 장르 토픽에 속한 글들을 의미 단위 소분류로 세분화하는 분석가입니다.
주어진 장르(예: "AI") 아래 글들을 2~5개의 소분류(예: "ChatGPT", "Gemini", "Claude", "AI검색", "프롬프트")로 나누세요.

아래 JSON만 반환하세요 (코드블록, 설명 없이 순수 JSON):
{ "children": [ { "name": "소분류명", "postIndices": [0, 2, 5] } ] }

규칙:
- 소분류명은 짧은 한국어 명사(브랜드/제품/세부 주제 등)
- 모든 글을 억지로 소분류에 넣지 않아도 됨 — 애매한 글은 어느 postIndices에도 넣지 말 것(장르 대분류에 그대로 남습니다)
- 의미 있게 나뉘지 않으면(글들이 사실상 한 덩어리면) children을 빈 배열로 반환`,
      messages: [{
        role: 'user',
        content: `장르: ${rootName}\n\n글 목록:\n${posts.map((p, i) => `[${i}] 제목: ${p.title}\n본문 발췌: ${p.excerpt}`).join('\n\n')}`,
      }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const parsed = parseJsonObjectFromClaudeText<{ children?: Partial<SplitChild>[] }>(rawText);
    const children = Array.isArray(parsed.children) ? parsed.children : [];
    return children
      .filter((c): c is SplitChild => !!c && typeof c.name === 'string' && Array.isArray(c.postIndices))
      .map(c => ({ name: normalizeTopicName(c.name), postIndices: c.postIndices }));
  } catch (err) {
    console.error('[curate-blog-topics] splitGenreTopic error:', err);
    return null;
  }
}

/**
 * 기존 토픽을 캐시에서 찾거나, 없으면 생성한다. upsert 대신 select-then-insert를 쓰는 이유:
 * topics의 유니크 제약이 parent_id IS NULL 여부로 나뉜 부분 유니크 인덱스라
 * PostgREST upsert의 onConflict가 predicate를 지정할 수 없어 매칭되지 않는다.
 */
async function getOrCreateTopic(
  supabase: SupabaseClient,
  cache: Map<string, string>,
  params: { userId: string; blogId: string; topicType: TopicType; parentId: string | null; name: string },
): Promise<string> {
  const key = `${params.topicType}::${params.parentId ?? 'root'}::${params.name}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const select = () => {
    let q = supabase
      .from('topics')
      .select('id')
      .eq('user_id', params.userId)
      .eq('blog_id', params.blogId)
      .eq('topic_type', params.topicType)
      .eq('name', params.name);
    q = params.parentId ? q.eq('parent_id', params.parentId) : q.is('parent_id', null);
    return q.maybeSingle();
  };

  const { data: existing } = await select();
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('topics')
    .insert({ user_id: params.userId, blog_id: params.blogId, topic_type: params.topicType, parent_id: params.parentId, name: params.name })
    .select('id')
    .single();

  if (error || !created) {
    // 동시성 레이스로 유니크 제약에 걸린 경우 재조회
    const { data: retry } = await select();
    if (retry) {
      cache.set(key, retry.id);
      return retry.id;
    }
    throw error || new Error('토픽 생성 실패');
  }

  cache.set(key, created.id);
  return created.id;
}

/** 토픽에 연결된 글들을 기준으로 post_count/total_view_count/thumbnail_url/first·last_post_at을 재계산 */
async function refreshTopicAggregates(supabase: SupabaseClient, topicId: string) {
  const { data: topic } = await supabase.from('topics').select('user_id').eq('id', topicId).maybeSingle();
  if (!topic) return;

  const { data: links } = await supabase.from('topic_posts').select('post_id').eq('topic_id', topicId);
  const postIds = (links || []).map(l => l.post_id);
  if (postIds.length === 0) return;

  const { data: contents } = await supabase
    .from('blog_post_contents')
    .select('view_count, thumbnail_url, published_at')
    .eq('user_id', topic.user_id)
    .in('post_id', postIds);
  const rows = contents || [];

  const totalViewCount = rows.reduce((sum, r) => sum + (r.view_count || 0), 0);
  const withThumb = [...rows].filter(r => r.thumbnail_url).sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  const thumbnailUrl = withThumb[0]?.thumbnail_url || null;
  const postCount = postIds.length;

  const publishedMsList = rows
    .map(r => (r.published_at ? parseNaverPostDate(r.published_at) : null))
    .filter((v): v is number => v != null);
  const firstPostAt = publishedMsList.length ? new Date(Math.min(...publishedMsList)).toISOString() : null;
  const lastPostAt = publishedMsList.length ? new Date(Math.max(...publishedMsList)).toISOString() : new Date().toISOString();

  await supabase
    .from('topics')
    .update({
      post_count: postCount,
      total_view_count: totalViewCount,
      thumbnail_url: thumbnailUrl,
      first_post_at: firstPostAt,
      last_post_at: lastPostAt,
    })
    .eq('id', topicId);
}

/** 15개 이상 쌓인 장르 대분류를 소분류로 자동 세분화(content_categories의 세분화 로직을 genre 축에 이식) */
async function trySplitOversizedGenres(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
  blogId: string,
  cache: Map<string, string>,
): Promise<void> {
  const { data: roots } = await supabase
    .from('topics')
    .select('id, name, last_split_checked_at, last_split_checked_count')
    .eq('user_id', userId)
    .eq('blog_id', blogId)
    .eq('topic_type', 'genre')
    .is('parent_id', null);

  for (const root of roots || []) {
    const { data: childRows } = await supabase.from('topics').select('id').eq('parent_id', root.id).limit(1);
    if (childRows && childRows.length > 0) continue; // 이미 세분화됨

    const { count } = await supabase
      .from('topic_posts')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', root.id);
    const postCount = count || 0;
    if (postCount < SPLIT_THRESHOLD) continue;

    const alreadyChecked = root.last_split_checked_at != null;
    const grown = alreadyChecked && root.last_split_checked_count != null && postCount >= root.last_split_checked_count * SPLIT_GROWTH_RATIO;
    if (alreadyChecked && !grown) continue;

    const { data: links } = await supabase.from('topic_posts').select('post_id').eq('topic_id', root.id).limit(SPLIT_SAMPLE_CAP);
    const postIds = (links || []).map(l => l.post_id);

    const samplePosts: { post_id: string; title: string | null; content_excerpt: string | null }[] = [];
    if (postIds.length > 0) {
      const { data: posts } = await supabase
        .from('blog_post_contents')
        .select('post_id, title, content_excerpt')
        .eq('user_id', userId)
        .in('post_id', postIds);
      samplePosts.push(...(posts || []));
    }

    const children = await splitGenreTopic(
      anthropic,
      root.name,
      samplePosts.map(p => ({ title: p.title || '', excerpt: (p.content_excerpt || '').slice(0, 300) })),
    );

    if (children && children.length >= 2) {
      for (const child of children) {
        const memberPosts = child.postIndices.map(i => samplePosts[i]).filter((p): p is (typeof samplePosts)[number] => !!p);
        if (memberPosts.length === 0) continue;
        const childId = await getOrCreateTopic(supabase, cache, { userId, blogId, topicType: 'genre', parentId: root.id, name: child.name });
        for (const p of memberPosts) {
          await supabase.from('topic_posts').update({ topic_id: childId }).eq('topic_id', root.id).eq('post_id', p.post_id);
        }
        await refreshTopicAggregates(supabase, childId);
      }
      await refreshTopicAggregates(supabase, root.id);
    }

    await supabase
      .from('topics')
      .update({ last_split_checked_at: new Date().toISOString(), last_split_checked_count: postCount })
      .eq('id', root.id);
  }
}

/**
 * 매일 자동 실행 — INFLUENCER 플랜 활성 사용자의 블로그 신규 글을 증분 분석해
 * Claude 프롬프트 기반으로 장르/작가/출판사/브랜드/업체/지역/키워드 다차원 토픽 그룹핑을 수행한다.
 * GET /api/cron/curate-blog-topics
 */
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
          .from('topics')
          .select('id, topic_type, name')
          .eq('user_id', userId)
          .eq('blog_id', blogId)
          .is('parent_id', null);

        const topicIdByKey = new Map<string, string>();
        const namesByType = new Map<TopicType, Set<string>>();
        for (const t of existingTopics || []) {
          const type = t.topic_type as TopicType;
          const name = normalizeTopicName(t.name);
          topicIdByKey.set(`${type}::root::${name}`, t.id);
          const set = namesByType.get(type) || new Set<string>();
          set.add(name);
          namesByType.set(type, set);
        }

        for (const post of newPosts) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) break;

          try {
            const { title, text, charCount, thumbnailUrl } = await extractPostText(blogId, post.id);
            if (charCount < 100) {
              await sleep(300);
              continue;
            }

            const suggestions = await classifyPostIntoTopics(
              anthropic,
              { title: title || post.title, text, category: post.category },
              namesByType,
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
              },
              { onConflict: 'user_id,post_id' },
            );
            totalNewPosts++;

            for (const suggestion of suggestions || []) {
              if (suggestion.confidence < CONFIDENCE_MIN) continue;

              const key = `${suggestion.type}::root::${suggestion.name}`;
              const existingTopicId = topicIdByKey.get(key);

              if (existingTopicId) {
                await supabase.from('topic_posts').upsert(
                  { topic_id: existingTopicId, user_id: userId, post_id: post.id, relevance_score: suggestion.confidence },
                  { onConflict: 'topic_id,post_id' },
                );
                await refreshTopicAggregates(supabase, existingTopicId);
                continue;
              }

              const { data: otherCandidates } = await supabase
                .from('topic_candidates')
                .select('id, post_id')
                .eq('user_id', userId)
                .eq('blog_id', blogId)
                .eq('topic_type', suggestion.type)
                .eq('suggested_name', suggestion.name);
              const otherPost = (otherCandidates || []).find(c => c.post_id !== post.id);

              if (otherPost) {
                // 같은 타입+이름의 후보가 다른 글에서도 나왔다 — 실제 토픽으로 승격
                const newTopicId = await getOrCreateTopic(supabase, topicIdByKey, {
                  userId, blogId, topicType: suggestion.type, parentId: null, name: suggestion.name,
                });

                await supabase.from('topic_posts').upsert(
                  [
                    { topic_id: newTopicId, user_id: userId, post_id: post.id, relevance_score: suggestion.confidence },
                    { topic_id: newTopicId, user_id: userId, post_id: otherPost.post_id, relevance_score: suggestion.confidence },
                  ],
                  { onConflict: 'topic_id,post_id' },
                );
                await supabase
                  .from('topic_candidates')
                  .delete()
                  .eq('user_id', userId)
                  .eq('blog_id', blogId)
                  .eq('topic_type', suggestion.type)
                  .eq('suggested_name', suggestion.name);
                await refreshTopicAggregates(supabase, newTopicId);

                const set = namesByType.get(suggestion.type) || new Set<string>();
                set.add(suggestion.name);
                namesByType.set(suggestion.type, set);
              } else {
                await supabase.from('topic_candidates').upsert(
                  { user_id: userId, blog_id: blogId, post_id: post.id, topic_type: suggestion.type, suggested_name: suggestion.name },
                  { onConflict: 'user_id,post_id,topic_type,suggested_name' },
                );
              }
            }
          } catch (postErr) {
            totalFailed++;
            console.error(`[curate-blog-topics] post ${blogId}/${post.id} failed:`, postErr);
          }

          await sleep(500);
        }

        if (Date.now() - startedAt < TIME_BUDGET_MS) {
          await trySplitOversizedGenres(supabase, anthropic, userId, blogId, topicIdByKey);
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
