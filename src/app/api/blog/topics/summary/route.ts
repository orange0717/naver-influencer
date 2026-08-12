import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { computeTopicFit } from '@/lib/topic-fit';

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
    .select('id, suggested_name, topic_subject_category, representative_keywords, matched_post_ids, estimated_post_count, reasoning, generated_at')
    .eq('user_id', userId)
    .order('estimated_post_count', { ascending: false });
  if (blogId) recommendationsQuery = recommendationsQuery.eq('blog_id', blogId);

  const [{ data: summaries, error: summaryError }, { data: recommendations, error: recError }] = await Promise.all([
    summaryQuery,
    recommendationsQuery,
  ]);

  if (summaryError) {
    console.error({
      endpoint: '/api/blog/topics/summary',
      query: 'topic_insight_summaries',
      userId,
      blogId,
      error: summaryError,
    });
  }
  if (recError) {
    console.error({
      endpoint: '/api/blog/topics/summary',
      query: 'topic_ai_recommendations',
      userId,
      blogId,
      error: recError,
    });
  }

  // 배치 분석이 아직 한 번도 안 돈 사용자(집계 테이블에 행 없음)도 정상 상태 —
  // 조회 자체가 실패한 경우(테이블/컬럼 오류 등)도 페이지를 막지 않고 빈 요약으로 폴백한다.
  const summary = summaryError ? null : (summaries || [])[0] || null;
  const safeRecommendations = recError ? [] : recommendations || [];

  // ─── 추천 카드용 보강: 대표 썸네일 + 적합도(키워드 일치율) ───
  // 매칭 글들의 썸네일/제목/태그를 한 번에 조회해 카드가 클릭 전에도 시각적으로 어떤 묶음인지
  // 바로 이해되게 한다(스펙 18항). 적합도는 저장된 데이터만으로 계산(새 AI 호출 없음, 스펙 21항).
  type PostMeta = { title: string | null; tags: string[]; thumbnail_url: string | null };
  const postMetaById = new Map<string, PostMeta>();
  const allPostIds = [
    ...new Set(
      safeRecommendations.flatMap((r) => ((r.matched_post_ids as string[] | null) || []).slice(0, 12)),
    ),
  ];
  if (allPostIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < allPostIds.length; i += CHUNK) {
      const chunk = allPostIds.slice(i, i + CHUNK);
      const { data: metaRows } = await supabase
        .from('blog_post_contents')
        .select('post_id, title, tags, thumbnail_url')
        .eq('user_id', userId)
        .in('post_id', chunk);
      for (const m of metaRows || []) {
        postMetaById.set(m.post_id as string, {
          title: (m.title as string | null) ?? null,
          tags: (m.tags as string[] | null) || [],
          thumbnail_url: (m.thumbnail_url as string | null) ?? null,
        });
      }
    }
  }

  const enrichedRecommendations = safeRecommendations.map((r) => {
    const matchedIds = (r.matched_post_ids as string[] | null) || [];
    const metas = matchedIds.map((id) => postMetaById.get(id)).filter((m): m is PostMeta => !!m);
    const thumbnails = metas.map((m) => m.thumbnail_url).filter((u): u is string => !!u).slice(0, 4);
    const fitScore = computeTopicFit(
      (r.representative_keywords as string[] | null) || [],
      metas.map((m) => ({ title: m.title, tags: m.tags })),
    );
    // matched_post_ids는 카드 표시에 불필요하므로 payload에서 제외(상세는 /[id]에서 조회)
    const { matched_post_ids: _omit, ...rest } = r;
    void _omit;
    return { ...rest, thumbnails, fitScore };
  });

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
    recommendations: enrichedRecommendations,
  });
}
