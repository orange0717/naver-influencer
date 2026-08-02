import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/topics/[id]?sort=latest|views
 * [id]는 네이버 블로그 카테고리명(URL 인코딩됨). 해당 카테고리에 속한 글 목록을 정렬해 반환한다.
 * AI 분류 없이 blog_post_contents.category 그대로 사용 — 본인 소유 글만 조회 가능.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const category = decodeURIComponent(id).trim();
  if (!category) {
    return NextResponse.json({ error: '잘못된 카테고리입니다.' }, { status: 400 });
  }

  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get('sort') || 'latest';

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from('blog_post_contents')
    .select('post_id, blog_id, title, thumbnail_url, view_count, published_at, category')
    .eq('user_id', userId)
    .eq('category', category);

  if (error) {
    return NextResponse.json({ error: '카테고리 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 });
  }

  const blogId = rows[0].blog_id;
  const enriched = rows.map(p => ({
    post_id: p.post_id,
    title: p.title,
    thumbnail_url: p.thumbnail_url,
    view_count: p.view_count,
    published_at: p.published_at,
    category: p.category,
    url: `https://blog.naver.com/${p.blog_id}/${p.post_id}`,
    publishedAtMs: p.published_at ? parseNaverPostDate(p.published_at) || 0 : 0,
  }));

  switch (sort) {
    case 'views':
      enriched.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      break;
    case 'latest':
    default:
      enriched.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
      break;
  }

  const totalViewCount = enriched.reduce((sum, p) => sum + (p.view_count || 0), 0);
  const withThumb = [...enriched].filter(p => p.thumbnail_url).sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

  return NextResponse.json({
    topic: {
      id: category,
      name: category,
      blogId,
      postCount: enriched.length,
      totalViewCount,
      thumbnailUrl: withThumb[0]?.thumbnail_url || null,
      lastPostAt: enriched.length ? new Date(Math.max(...enriched.map(p => p.publishedAtMs))).toISOString() : null,
    },
    posts: enriched,
    sort,
  });
}
