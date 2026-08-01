import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/topics/summary
 * 매일 analyze-topic-insights 크론이 미리 계산해둔 활용률/경쟁분석/추천토픽 스냅샷을 그대로 반환한다.
 * 실시간 Claude 호출 없음 — 캐시된 값만 읽는다.
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId')?.trim();

  const supabase = createServiceClient();

  let summaryQuery = supabase
    .from('topic_insight_summaries')
    .select(
      'blog_id, ai_possible_count, published_count, utilization_rate, my_topic_count, competitor_count, competitor_avg_topic_count, competitor_top_topic_count, generated_at',
    )
    .eq('user_id', userId);
  if (blogId) summaryQuery = summaryQuery.eq('blog_id', blogId);

  let recommendationsQuery = supabase
    .from('topic_ai_recommendations')
    .select('id, suggested_name, topic_subject_category, representative_keywords, estimated_post_count, reasoning, generated_at')
    .eq('user_id', userId)
    .order('estimated_post_count', { ascending: false });
  if (blogId) recommendationsQuery = recommendationsQuery.eq('blog_id', blogId);

  const [{ data: summaries, error: summaryError }, { data: recommendations, error: recError }] = await Promise.all([
    summaryQuery,
    recommendationsQuery,
  ]);

  if (summaryError || recError) {
    return NextResponse.json({ error: '요약 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const summary = (summaries || [])[0] || null;

  return NextResponse.json({
    myTopicCount: summary?.my_topic_count ?? 0,
    publishedCount: summary?.published_count ?? 0,
    aiPossibleCount: summary?.ai_possible_count ?? 0,
    utilizationRate: summary?.utilization_rate ?? 0,
    generatedAt: summary?.generated_at ?? null,
    competitor: {
      count: summary?.competitor_count ?? 0,
      avg: summary?.competitor_avg_topic_count ?? null,
      top: summary?.competitor_top_topic_count ?? null,
    },
    recommendations: recommendations || [],
  });
}
