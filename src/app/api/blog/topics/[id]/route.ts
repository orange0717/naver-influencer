import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-fA-F-]{36}$/;
const RELATED_LIMIT = 6;

/**
 * GET /api/blog/topics/[id]?sort=recommended|latest|views
 * 토픽 상세: 통계 + 소속 글 목록(정렬) + 소분류(장르만) + 관련 토픽(글을 공유하는 다른 토픽).
 * 본인 소유 토픽만 조회 가능.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: '잘못된 토픽 ID입니다.' }, { status: 400 });
  }

  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get('sort') || 'recommended';

  const supabase = createServiceClient();

  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .select('id, blog_id, topic_type, name, description, representative_keywords, thumbnail_url, post_count, total_view_count, first_post_at, last_post_at, confidence, parent_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (topicError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!topic) {
    return NextResponse.json({ error: '토픽을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: links, error: linksError } = await supabase
    .from('topic_posts')
    .select('post_id, relevance_score')
    .eq('topic_id', id);
  if (linksError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const postIds = (links || []).map(l => l.post_id);
  const relevanceByPostId = new Map((links || []).map(l => [l.post_id, l.relevance_score]));

  let posts: {
    post_id: string;
    title: string | null;
    thumbnail_url: string | null;
    view_count: number | null;
    published_at: string | null;
    category: string | null;
  }[] = [];

  if (postIds.length > 0) {
    const { data: contents, error: contentsError } = await supabase
      .from('blog_post_contents')
      .select('post_id, title, thumbnail_url, view_count, published_at, category')
      .eq('user_id', userId)
      .in('post_id', postIds);
    if (contentsError) {
      return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
    }
    posts = contents || [];
  }

  const enriched = posts.map(p => ({
    ...p,
    url: `https://blog.naver.com/${topic.blog_id}/${p.post_id}`,
    relevanceScore: relevanceByPostId.get(p.post_id) ?? 0,
    publishedAtMs: p.published_at ? parseNaverPostDate(p.published_at) || 0 : 0,
  }));

  switch (sort) {
    case 'latest':
      enriched.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
      break;
    case 'views':
      enriched.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      break;
    case 'recommended':
    default:
      enriched.sort((a, b) => b.relevanceScore - a.relevanceScore);
      break;
  }

  // 소분류(장르 대분류인 경우만)
  let children: { id: string; name: string; postCount: number }[] = [];
  if (topic.topic_type === 'genre' && !topic.parent_id) {
    const { data: childRows } = await supabase
      .from('topics')
      .select('id, name, post_count')
      .eq('parent_id', id)
      .order('post_count', { ascending: false });
    children = (childRows || []).map(c => ({ id: c.id, name: c.name, postCount: c.post_count }));
  }

  // 관련 토픽: 같은 글을 공유하는 다른 토픽을 겹치는 글 수 기준으로 정렬(라이브 집계, 별도 캐시 없음)
  let relatedTopics: { id: string; topicType: string; name: string; sharedPostCount: number }[] = [];
  if (postIds.length > 0) {
    const { data: overlapLinks } = await supabase
      .from('topic_posts')
      .select('topic_id, post_id')
      .in('post_id', postIds)
      .neq('topic_id', id);

    const sharedCountByTopicId = new Map<string, number>();
    for (const l of overlapLinks || []) {
      sharedCountByTopicId.set(l.topic_id, (sharedCountByTopicId.get(l.topic_id) || 0) + 1);
    }

    const topRelatedIds = Array.from(sharedCountByTopicId.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, RELATED_LIMIT)
      .map(([topicId]) => topicId);

    if (topRelatedIds.length > 0) {
      const { data: relatedRows } = await supabase
        .from('topics')
        .select('id, topic_type, name')
        .in('id', topRelatedIds)
        .eq('user_id', userId);

      const relatedById = new Map((relatedRows || []).map(r => [r.id, r]));
      relatedTopics = topRelatedIds
        .map(topicId => {
          const r = relatedById.get(topicId);
          if (!r) return null;
          return { id: r.id, topicType: r.topic_type, name: r.name, sharedPostCount: sharedCountByTopicId.get(topicId) || 0 };
        })
        .filter((r): r is { id: string; topicType: string; name: string; sharedPostCount: number } => r != null);
    }
  }

  return NextResponse.json({
    topic: {
      id: topic.id,
      topicType: topic.topic_type,
      name: topic.name,
      description: topic.description,
      representativeKeywords: topic.representative_keywords || [],
      thumbnailUrl: topic.thumbnail_url,
      postCount: topic.post_count,
      totalViewCount: topic.total_view_count,
      firstPostAt: topic.first_post_at,
      lastPostAt: topic.last_post_at,
      confidence: topic.confidence,
    },
    posts: enriched,
    children,
    relatedTopics,
    sort,
  });
}
