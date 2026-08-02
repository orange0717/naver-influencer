import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * GET /api/blog/topics/[id]
 * AI가 찾아낸 "미발행 토픽 후보"(topic_ai_recommendations) 1건의 상세 — 매칭된 글 목록을 반환한다.
 * "토픽 만들기" 클릭 시 사용자가 네이버에서 직접 토픽을 만들 때 참고할 글 목록/링크를 보여주기 위함.
 * 본인 소유 추천만 조회 가능.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: '잘못된 추천 토픽 ID입니다.' }, { status: 400 });
  }

  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const supabase = createServiceClient();

  const { data: recommendation, error: recError } = await supabase
    .from('topic_ai_recommendations')
    .select('id, blog_id, suggested_name, topic_subject_category, representative_keywords, matched_post_ids, estimated_post_count, reasoning, generated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (recError) {
    console.error({ endpoint: '/api/blog/topics/[id]', userId, id, error: recError });
    return NextResponse.json({ error: '추천 토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!recommendation) {
    return NextResponse.json({ error: '추천 토픽을 찾을 수 없습니다.' }, { status: 404 });
  }

  const postIds = recommendation.matched_post_ids || [];
  let posts: { post_id: string; title: string | null; url: string; view_count: number | null; published_at: string | null }[] = [];

  if (postIds.length > 0) {
    const { data: rows, error: postsError } = await supabase
      .from('blog_post_contents')
      .select('post_id, title, blog_id, view_count, published_at')
      .eq('user_id', userId)
      .in('post_id', postIds);

    if (postsError) {
      console.error({ endpoint: '/api/blog/topics/[id]', userId, id, error: postsError });
    } else {
      posts = (rows || []).map(p => ({
        post_id: p.post_id,
        title: p.title,
        url: `https://blog.naver.com/${p.blog_id}/${p.post_id}`,
        view_count: p.view_count,
        published_at: p.published_at,
      }));
    }
  }

  return NextResponse.json({ recommendation, posts });
}
