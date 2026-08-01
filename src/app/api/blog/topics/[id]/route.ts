import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-fA-F-]{36}$/;

/** "2024. 3. 15." 같은 네이버 비표준 날짜 문자열에서 대략적인 timestamp(ms)를 추출 */
function parseNaverDateMs(dateStr: string | null): number {
  if (!dateStr) return 0;
  const m = dateStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return 0;
  const [, y, mo, d] = m;
  const t = new Date(Number(y), Number(mo) - 1, Number(d)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * GET /api/blog/topics/[id]?sort=recommended|latest|views|popular
 * 토픽에 속한 글 목록을 정렬해 반환한다. 본인 소유 토픽만 조회 가능.
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
    .from('blog_topics')
    .select('id, blog_id, name, representative_keywords, thumbnail_url, post_count, total_view_count, score, last_post_at')
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
    .from('blog_topic_posts')
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
    publishedAtMs: parseNaverDateMs(p.published_at),
  }));

  switch (sort) {
    case 'latest':
      enriched.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
      break;
    case 'views':
      enriched.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      break;
    case 'popular': {
      const now = Date.now();
      const popularity = (p: typeof enriched[number]) => {
        const daysAgo = p.publishedAtMs > 0 ? (now - p.publishedAtMs) / 86_400_000 : 365;
        return (p.view_count || 0) + Math.max(0, 90 - daysAgo) * 10;
      };
      enriched.sort((a, b) => popularity(b) - popularity(a));
      break;
    }
    case 'recommended':
    default:
      enriched.sort((a, b) => b.relevanceScore - a.relevanceScore);
      break;
  }

  return NextResponse.json({ topic, posts: enriched, sort });
}
