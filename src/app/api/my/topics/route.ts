import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export interface TopicSummary {
  id: string;
  topicType: string;
  name: string;
  postCount: number;
  lastPostAt: string | null;
  avgIntegratedRank: number | null;
  avgBlogRank: number | null;
  aiBriefingCount: number;
  aiTabCount: number;
  challengeTop3Count: number;
  newPosts30d: number;
  isRepresentative: boolean;
  representativeScore: number;
}

/**
 * GET /api/my/topics?blogId=xxx
 * curate-blog-topics 크론이 채우는 topics 테이블을 그대로 반환 — 별도 실시간 재계산 없음.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('topics')
    .select(
      'id, topic_type, name, post_count, last_post_at, avg_integrated_rank, avg_blog_rank, ai_briefing_count, ai_tab_count, challenge_top3_count, new_posts_30d, is_representative, representative_score',
    )
    .eq('user_id', auth.userId)
    .eq('blog_id', blogId)
    .order('is_representative', { ascending: false })
    .order('post_count', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const topics: TopicSummary[] = (data || []).map(t => ({
    id: t.id as string,
    topicType: t.topic_type as string,
    name: t.name as string,
    postCount: t.post_count as number,
    lastPostAt: t.last_post_at as string | null,
    avgIntegratedRank: t.avg_integrated_rank as number | null,
    avgBlogRank: t.avg_blog_rank as number | null,
    aiBriefingCount: t.ai_briefing_count as number,
    aiTabCount: t.ai_tab_count as number,
    challengeTop3Count: t.challenge_top3_count as number,
    newPosts30d: t.new_posts_30d as number,
    isRepresentative: t.is_representative as boolean,
    representativeScore: t.representative_score as number,
  }));

  return NextResponse.json({ topics });
}
