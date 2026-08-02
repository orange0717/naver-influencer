import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

const TOPIC_TYPES = ['genre', 'author', 'publisher', 'brand', 'business', 'region', 'keyword'] as const;
type TopicType = (typeof TOPIC_TYPES)[number];

const RECENT_DAYS_MS = 30 * 86400000;
// 전문성 점수(v1 휴리스틱, genre 타입 전용) — 발행량 40 + 최근활동 30 + 평균조회수 30, 합산 최대 100.
const VOLUME_SCORE_MAX = 40;
const RECENCY_SCORE_MAX = 30;
const RECENCY_TARGET_COUNT = 5;
const VIEW_SCORE_MAX = 30;
const VIEW_SCORE_TARGET_AVG = 10_000;

function computeExpertiseScore(totalCount: number, recentCount30: number, avgViews: number): number {
  const volumeScore = Math.min(VOLUME_SCORE_MAX, Math.round(10 * Math.log2(totalCount + 1)));
  const recencyScore = Math.round(RECENCY_SCORE_MAX * Math.min(recentCount30 / RECENCY_TARGET_COUNT, 1));
  const viewScore = Math.round(VIEW_SCORE_MAX * Math.min(avgViews / VIEW_SCORE_TARGET_AVG, 1));
  return Math.min(100, volumeScore + recencyScore + viewScore);
}

/**
 * GET /api/blog/topics?type=&sort=&q=&blogId=
 * 로그인한 INFLUENCER 플랜 사용자의 다차원 토픽(장르/작가/출판사/브랜드/업체/지역/키워드) 목록.
 * type: 특정 topic_type 필터(생략 시 전체), sort: latest|posts|views|name, q: 이름 검색어.
 * 게시글이 2개 이상인 토픽만 노출된다(크론이 애초에 그렇게만 생성함).
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId')?.trim();
  const typeParam = searchParams.get('type')?.trim();
  const type = typeParam && (TOPIC_TYPES as readonly string[]).includes(typeParam) ? (typeParam as TopicType) : null;
  const sort = searchParams.get('sort') || 'latest';
  const q = searchParams.get('q')?.trim();

  const supabase = createServiceClient();

  let query = supabase
    .from('topics')
    .select('id, topic_type, name, description, representative_keywords, thumbnail_url, post_count, total_view_count, first_post_at, last_post_at, confidence')
    .eq('user_id', userId)
    .is('parent_id', null);
  if (blogId) query = query.eq('blog_id', blogId);
  if (type) query = query.eq('topic_type', type);
  if (q) query = query.ilike('name', `%${q}%`);

  switch (sort) {
    case 'posts':
      query = query.order('post_count', { ascending: false });
      break;
    case 'views':
      query = query.order('total_view_count', { ascending: false });
      break;
    case 'name':
      query = query.order('name', { ascending: true });
      break;
    case 'latest':
    default:
      query = query.order('last_post_at', { ascending: false, nullsFirst: false });
      break;
  }

  const { data: topics, error } = await query;
  if (error) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const rows = topics || [];
  const genreIds = rows.filter(t => t.topic_type === 'genre').map(t => t.id);

  const childCountByParent = new Map<string, number>();
  const expertiseById = new Map<string, number>();

  if (genreIds.length > 0) {
    const [{ data: children }, { data: links }] = await Promise.all([
      supabase.from('topics').select('parent_id').in('parent_id', genreIds),
      supabase.from('topic_posts').select('topic_id, post_id').in('topic_id', genreIds),
    ]);

    for (const c of children || []) {
      if (!c.parent_id) continue;
      childCountByParent.set(c.parent_id, (childCountByParent.get(c.parent_id) || 0) + 1);
    }

    const postIdsByTopic = new Map<string, string[]>();
    const allPostIds = new Set<string>();
    for (const l of links || []) {
      const arr = postIdsByTopic.get(l.topic_id) || [];
      arr.push(l.post_id);
      postIdsByTopic.set(l.topic_id, arr);
      allPostIds.add(l.post_id);
    }

    if (allPostIds.size > 0) {
      const { data: contents } = await supabase
        .from('blog_post_contents')
        .select('post_id, view_count, published_at')
        .eq('user_id', userId)
        .in('post_id', Array.from(allPostIds));

      const contentByPostId = new Map((contents || []).map(c => [c.post_id, c]));
      const now = Date.now();

      for (const topicId of genreIds) {
        const postIds = postIdsByTopic.get(topicId) || [];
        if (postIds.length === 0) continue;
        let totalViews = 0;
        let recentCount30 = 0;
        for (const pid of postIds) {
          const content = contentByPostId.get(pid);
          if (!content) continue;
          totalViews += content.view_count || 0;
          const publishedAtMs = content.published_at ? parseNaverPostDate(content.published_at) : null;
          if (publishedAtMs && now - publishedAtMs <= RECENT_DAYS_MS) recentCount30++;
        }
        const avgViews = postIds.length > 0 ? totalViews / postIds.length : 0;
        expertiseById.set(topicId, computeExpertiseScore(postIds.length, recentCount30, avgViews));
      }
    }
  }

  const result = rows.map(t => ({
    id: t.id,
    topicType: t.topic_type,
    name: t.name,
    description: t.description,
    representativeKeywords: t.representative_keywords || [],
    thumbnailUrl: t.thumbnail_url,
    postCount: t.post_count,
    totalViewCount: t.total_view_count,
    firstPostAt: t.first_post_at,
    lastPostAt: t.last_post_at,
    confidence: t.confidence,
    ...(t.topic_type === 'genre'
      ? { expertiseScore: expertiseById.get(t.id) ?? null, childCount: childCountByParent.get(t.id) || 0 }
      : {}),
  }));

  return NextResponse.json({ topics: result, totalCount: result.length });
}
