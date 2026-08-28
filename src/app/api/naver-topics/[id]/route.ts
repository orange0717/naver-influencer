import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * GET /api/naver-topics/[id]
 * 네이버 실제 발행 토픽 1건 + 포함된 포스팅(naver_influencer_topic_posts) 목록.
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

  const supabase = createServiceClient();

  const { data: topic, error: topicError } = await supabase
    .from('naver_influencer_topics')
    .select('id, blog_id, topic_id, title, thumbnail_url, content_count, introduction, topic_subject, topic_subject_category, naver_created_at, naver_modified_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (topicError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!topic) {
    return NextResponse.json({ error: '토픽을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: posts, error: postsError } = await supabase
    .from('naver_influencer_topic_posts')
    .select('content_id, title, intro_body, tags')
    .eq('topic_pk', id)
    .order('created_at', { ascending: false });

  if (postsError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // ⚠️ topic.blog_id 는 **인플루언서 홈 핸들**(in.naver.com/{handle})이고, 글 링크가 필요한 건
  //    **블로그 아이디**(blog.naver.com/{blogId})다. 둘은 다를 수 있다 — orangelibrary(핸들) vs
  //    orangelibrary_(블로그). 예전엔 핸들로 blog.naver.com 링크를 만들어 전 글이 죽은 링크였다
  //    (2026-08-28 실측: blog.naver.com/orangelibrary 는 목록 조회 실패, orangelibrary_ 만 정상).
  const { data: profile } = await supabase
    .from('users')
    .select('blog_id')
    .eq('id', userId)
    .maybeSingle();
  const linkBlogId = ((profile?.blog_id as string | null) || '').trim() || topic.blog_id;

  const enrichedPosts = (posts || []).map(p => ({
    ...p,
    url: `https://blog.naver.com/${linkBlogId}/${p.content_id}`,
  }));

  const stats = await buildTopicStats(supabase, userId, topic, enrichedPosts);

  return NextResponse.json({ topic, posts: enrichedPosts, stats });
}

interface EnrichedPost {
  content_id: string;
  title: string | null;
  intro_body: string | null;
  tags: string[] | null;
  url: string;
}

/**
 * 게시글수 외 성과 지표(총/평균 조회수, 최근 발행일, 인기글, 관련 키워드, AI 추천 다음 토픽)를 계산한다.
 * 통계 조회가 실패해도 토픽/글 목록 응답 자체는 막지 않도록 여기서 에러를 흡수하고 null 필드로 폴백한다.
 */
async function buildTopicStats(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  topic: { blog_id: string; topic_subject_category: string | null },
  posts: EnrichedPost[],
) {
  const postCount = posts.length;
  const base = {
    postCount,
    totalViewCount: 0,
    avgViewCount: 0,
    /** 조회수를 실제로 한 건이라도 읽어냈는지. false 면 0회가 아니라 '아직 수집 전'이다. */
    viewCountMeasured: false,
    /** 조회수를 읽어낸 글 수 — "5개 중 2개만 확인"처럼 중간 상태를 그대로 보여주기 위한 값 */
    measuredPostCount: 0,
    latestPublishedAt: null as string | null,
    topPost: null as { content_id: string; title: string | null; view_count: number; url: string } | null,
    relatedKeywords: Array.from(new Set([topic.topic_subject_category, ...posts.flatMap(p => p.tags || [])].filter((v): v is string => !!v))),
    nextRecommendation: null as {
      id: string; suggested_name: string; topic_subject_category: string | null;
      representative_keywords: string[]; estimated_post_count: number;
    } | null,
  };

  if (postCount === 0) return base;

  const contentIds = posts.map(p => p.content_id);
  const { data: contents, error: contentsError } = await supabase
    .from('blog_post_contents')
    .select('post_id, view_count, published_at')
    .eq('user_id', userId)
    .in('post_id', contentIds);

  if (contentsError) {
    console.error({ endpoint: '/api/naver-topics/[id]', userId, step: 'blog_post_contents_stats', error: contentsError });
  } else if (contents) {
    const contentByPostId = new Map(contents.map(c => [c.post_id, c]));
    let totalViewCount = 0;
    let measured = 0;
    let latestMs: number | null = null;
    let topPost: { content_id: string; title: string | null; view_count: number; url: string } | null = null;

    // ⚠️ 아직 본문/조회수를 수집하지 않은 글(c 가 없거나 view_count 가 null)을 0회로 세면
    //    "재지 못했다"가 "0회였다"로 둔갑한다. 합계·평균·인기글 모두 **실제로 읽어낸 글만** 쓴다.
    for (const p of posts) {
      const c = contentByPostId.get(p.content_id);
      const raw = c?.view_count;
      const publishedAtMs = c?.published_at ? parseNaverPostDate(c.published_at) : null;
      if (publishedAtMs && (latestMs === null || publishedAtMs > latestMs)) latestMs = publishedAtMs;
      if (raw === undefined || raw === null) continue;
      measured++;
      totalViewCount += raw;
      if (!topPost || raw > topPost.view_count) {
        topPost = { content_id: p.content_id, title: p.title, view_count: raw, url: p.url };
      }
    }

    base.totalViewCount = totalViewCount;
    base.avgViewCount = measured > 0 ? Math.round(totalViewCount / measured) : 0;
    base.viewCountMeasured = measured > 0;
    base.measuredPostCount = measured;
    base.latestPublishedAt = latestMs !== null ? new Date(latestMs).toISOString() : null;
    base.topPost = topPost;
  }

  const { data: recommendations, error: recError } = await supabase
    .from('topic_ai_recommendations')
    .select('id, suggested_name, topic_subject_category, representative_keywords, estimated_post_count')
    .eq('user_id', userId)
    .eq('blog_id', topic.blog_id);

  if (recError) {
    console.error({ endpoint: '/api/naver-topics/[id]', userId, step: 'next_recommendation', error: recError });
  } else if (recommendations && topic.topic_subject_category) {
    base.nextRecommendation = recommendations.find(r => r.topic_subject_category === topic.topic_subject_category) || null;
  }

  return base;
}
