import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/topics?blogId=
 * 로그인한 INFLUENCER 플랜 사용자의 토픽 목록(AI추천순=score DESC) + 후보 힌트를 반환한다.
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId')?.trim();

  const supabase = createServiceClient();

  let topicsQuery = supabase
    .from('blog_topics')
    .select('id, name, representative_keywords, thumbnail_url, post_count, total_view_count, score, last_post_at')
    .eq('user_id', userId)
    .order('score', { ascending: false });
  if (blogId) topicsQuery = topicsQuery.eq('blog_id', blogId);

  let candidatesQuery = supabase
    .from('blog_topic_candidates')
    .select('id, post_id, suggested_topic_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (blogId) candidatesQuery = candidatesQuery.eq('blog_id', blogId);

  const [{ data: topics, error: topicsError }, { data: candidates, error: candidatesError }] = await Promise.all([
    topicsQuery,
    candidatesQuery,
  ]);

  if (topicsError || candidatesError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ topics: topics || [], candidates: candidates || [] });
}
