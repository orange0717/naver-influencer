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
  influencerId: string | null;
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

/** analyze-topic-insights와 동일한 조건(INFLUENCER 플랜 활성) → 본인 blog_id만 대상
 *  influencerId도 함께 해석한다(aggregate-ninfl-member-ranks와 동일 패턴) — 토픽 성과의
 *  키워드챌린지 TOP3 집계는 influencer_id 기준인 keyword_rankings를 조회해야 하기 때문. */
async function resolveTargets(supabase: SupabaseClient): Promise<Target[]> {
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, blog_id, linked_influencer_id, subscription_plan, subscription_expires_at')
    .eq('subscription_plan', 'INFLUENCER');
  if (usersError) throw usersError;

  const activeUsers = (users || []).filter(
    u => u.subscription_expires_at && new Date(u.subscription_expires_at).getTime() > Date.now(),
  );

  const linkedIds = Array.from(new Set(activeUsers.filter(u => u.linked_influencer_id).map(u => u.linked_influencer_id as string)));
  const blogOnlyIds = Array.from(new Set(activeUsers.filter(u => !u.linked_influencer_id && u.blog_id).map(u => u.blog_id as string)));

  const influencerById = new Map<string, { id: string; naver_id: string }>();
  if (linkedIds.length > 0) {
    const { data: rows } = await supabase.from('influencers').select('id, naver_id').in('id', linkedIds);
    for (const r of rows || []) influencerById.set(r.id as string, r as { id: string; naver_id: string });
  }
  const influencerByNaverId = new Map<string, { id: string; naver_id: string }>();
  if (blogOnlyIds.length > 0) {
    const { data: rows } = await supabase.from('influencers').select('id, naver_id').in('naver_id', blogOnlyIds);
    for (const r of rows || []) influencerByNaverId.set(r.naver_id as string, r as { id: string; naver_id: string });
  }

  return shuffle(activeUsers)
    .map(u => {
      const inf = u.linked_influencer_id
        ? influencerById.get(u.linked_influencer_id as string)
        : u.blog_id
          ? influencerByNaverId.get(u.blog_id as string)
          : undefined;
      return {
        userId: u.id as string,
        blogId: (u.blog_id || inf?.naver_id || '').trim(),
        influencerId: inf?.id || null,
      };
    })
    .filter(t => t.blogId);
}

/** keyword_challenges.keyword_clean과 동일한 정규화 (crawl-challenge-ranks/crawl-keywords와 동일 규칙) */
function cleanKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
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

function minMax(arr: number[]): [number, number] {
  if (arr.length === 0) return [0, 0];
  return [Math.min(...arr), Math.max(...arr)];
}

function normalizeHigherIsBetter(value: number, min: number, max: number): number {
  if (max <= min) return value > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function normalizeLowerIsBetter(value: number | null, min: number, max: number): number {
  if (value === null) return 0;
  if (max <= min) return 100;
  return Math.max(0, Math.min(100, ((max - value) / (max - min)) * 100));
}

/**
 * 토픽별 성과(통합검색·블로그탭 평균순위, AI 브리핑/탭, 키워드챌린지 TOP3, 최근 30일 신규글)를
 * 다시 집계하고, 사용자의 토픽들 중 가장 영향력 높은 1개를 대표 토픽으로 자동 선정한다.
 * 가중치: 포스팅수 25% · 최근활동 20% · 통합검색 15% · 블로그탭 15% · AI브리핑 10% · AI탭 5% · 챌린지TOP3 10%
 * (오렌지 제안서의 "포스팅 수/최근 활동/검색 성과/AI 브리핑 인용/AI 탭 노출/키워드챌린지 활동" 기준을 반영)
 */
async function computeTopicPerformance(supabase: SupabaseClient, target: Target) {
  const { userId, blogId, influencerId } = target;

  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, representative_keywords')
    .eq('user_id', userId)
    .eq('blog_id', blogId);
  const topics = (topicRows || []) as { id: string; representative_keywords: string[] | null }[];
  if (topics.length === 0) return;

  const topicIds = topics.map(t => t.id);
  const { data: postLinks } = await supabase.from('topic_posts').select('topic_id, post_id').in('topic_id', topicIds);
  const postIdsByTopic = new Map<string, string[]>();
  for (const link of postLinks || []) {
    const list = postIdsByTopic.get(link.topic_id as string) || [];
    list.push(link.post_id as string);
    postIdsByTopic.set(link.topic_id as string, list);
  }

  const [{ data: contentRows }, { data: rankLookups }, { data: briefings }] = await Promise.all([
    supabase.from('blog_post_contents').select('post_id, published_at').eq('user_id', userId).eq('blog_id', blogId),
    supabase.from('keyword_rank_lookups').select('post_id, view_rank, blog_rank').eq('user_id', userId).eq('blog_id', blogId),
    supabase.from('ai_briefing_exposures').select('post_id, exposed, tab_exposed').eq('user_id', userId).eq('blog_id', blogId),
  ]);

  const publishedAtByPost = new Map<string, Date | null>();
  for (const c of contentRows || []) publishedAtByPost.set(c.post_id as string, parsePostDate(c.published_at as string | null));

  const rankByPost = new Map<string, { view: number[]; blog: number[] }>();
  for (const r of rankLookups || []) {
    const entry = rankByPost.get(r.post_id as string) || { view: [], blog: [] };
    if (typeof r.view_rank === 'number') entry.view.push(r.view_rank);
    if (typeof r.blog_rank === 'number') entry.blog.push(r.blog_rank);
    rankByPost.set(r.post_id as string, entry);
  }

  const briefingByPost = new Map<string, { exposed: boolean; tabExposed: boolean }>();
  for (const b of briefings || []) {
    const entry = briefingByPost.get(b.post_id as string) || { exposed: false, tabExposed: false };
    if (b.exposed) entry.exposed = true;
    if (b.tab_exposed) entry.tabExposed = true;
    briefingByPost.set(b.post_id as string, entry);
  }

  // 대표 키워드 → keyword_challenges → 본인 keyword_rankings 최신 스냅샷에서 TOP3 여부 확인
  const top3KeywordCleanSet = new Set<string>();
  if (influencerId) {
    const allKeywords = Array.from(new Set(topics.flatMap(t => t.representative_keywords || [])));
    const cleanSet = Array.from(new Set(allKeywords.map(cleanKeyword))).filter(Boolean);
    if (cleanSet.length > 0) {
      const { data: matchedChallenges } = await supabase.from('keyword_challenges').select('id, keyword_clean').in('keyword_clean', cleanSet);
      const cleanByKeywordId = new Map((matchedChallenges || []).map(c => [c.id as string, c.keyword_clean as string]));
      const keywordIds = Array.from(cleanByKeywordId.keys());
      if (keywordIds.length > 0) {
        const { data: rankRows } = await supabase
          .from('keyword_rankings')
          .select('keyword_id, is_integrated_top3, snapshot_date')
          .eq('influencer_id', influencerId)
          .in('keyword_id', keywordIds)
          .order('snapshot_date', { ascending: false });
        const seen = new Set<string>();
        for (const row of rankRows || []) {
          const kwId = row.keyword_id as string;
          if (seen.has(kwId)) continue; // 최신 스냅샷만 채택
          seen.add(kwId);
          if (row.is_integrated_top3) {
            const clean = cleanByKeywordId.get(kwId);
            if (clean) top3KeywordCleanSet.add(clean);
          }
        }
      }
    }
  }

  const now = Date.now();
  const metrics = topics.map(topic => {
    const postIds = postIdsByTopic.get(topic.id) || [];
    const viewRanks: number[] = [];
    const blogRanks: number[] = [];
    let aiBriefingCount = 0;
    let aiTabCount = 0;
    let newPosts30d = 0;
    let daysSinceLastPost = 3650;
    for (const postId of postIds) {
      const rank = rankByPost.get(postId);
      if (rank) {
        viewRanks.push(...rank.view);
        blogRanks.push(...rank.blog);
      }
      const briefing = briefingByPost.get(postId);
      if (briefing?.exposed) aiBriefingCount++;
      if (briefing?.tabExposed) aiTabCount++;
      const publishedAt = publishedAtByPost.get(postId);
      if (publishedAt) {
        const ageMs = now - publishedAt.getTime();
        if (ageMs <= 30 * 24 * 60 * 60 * 1000) newPosts30d++;
        daysSinceLastPost = Math.min(daysSinceLastPost, ageMs / (24 * 60 * 60 * 1000));
      }
    }
    const avgIntegratedRank = viewRanks.length > 0 ? viewRanks.reduce((a, b) => a + b, 0) / viewRanks.length : null;
    const avgBlogRank = blogRanks.length > 0 ? blogRanks.reduce((a, b) => a + b, 0) / blogRanks.length : null;
    const challengeTop3Count = (topic.representative_keywords || []).filter(k => top3KeywordCleanSet.has(cleanKeyword(k))).length;
    return { id: topic.id, postCount: postIds.length, avgIntegratedRank, avgBlogRank, aiBriefingCount, aiTabCount, challengeTop3Count, newPosts30d, daysSinceLastPost };
  });

  const [postMin, postMax] = minMax(metrics.map(m => m.postCount));
  const [dayMin, dayMax] = minMax(metrics.map(m => m.daysSinceLastPost));
  const [intMin, intMax] = minMax(metrics.map(m => m.avgIntegratedRank).filter((v): v is number => v !== null));
  const [blogMin, blogMax] = minMax(metrics.map(m => m.avgBlogRank).filter((v): v is number => v !== null));
  const [briefMin, briefMax] = minMax(metrics.map(m => m.aiBriefingCount));
  const [tabMin, tabMax] = minMax(metrics.map(m => m.aiTabCount));
  const [top3Min, top3Max] = minMax(metrics.map(m => m.challengeTop3Count));

  const scored = metrics.map(m => {
    const score =
      0.25 * normalizeHigherIsBetter(m.postCount, postMin, postMax) +
      0.20 * normalizeLowerIsBetter(m.daysSinceLastPost, dayMin, dayMax) +
      0.15 * normalizeLowerIsBetter(m.avgIntegratedRank, intMin, intMax) +
      0.15 * normalizeLowerIsBetter(m.avgBlogRank, blogMin, blogMax) +
      0.10 * normalizeHigherIsBetter(m.aiBriefingCount, briefMin, briefMax) +
      0.05 * normalizeHigherIsBetter(m.aiTabCount, tabMin, tabMax) +
      0.10 * normalizeHigherIsBetter(m.challengeTop3Count, top3Min, top3Max);
    return { ...m, score: Math.round(score * 100) / 100 };
  });
  const representativeId = scored.length > 0 ? scored.reduce((best, cur) => (cur.score > best.score ? cur : best)).id : null;

  for (const m of scored) {
    await supabase
      .from('topics')
      .update({
        avg_integrated_rank: m.avgIntegratedRank,
        avg_blog_rank: m.avgBlogRank,
        ai_briefing_count: m.aiBriefingCount,
        ai_tab_count: m.aiTabCount,
        challenge_top3_count: m.challengeTop3Count,
        new_posts_30d: m.newPosts30d,
        representative_score: m.score,
        is_representative: m.id === representativeId,
      })
      .eq('id', m.id);
  }
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
        await computeTopicPerformance(supabase, target);
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
