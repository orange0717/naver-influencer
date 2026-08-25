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
  /**
   * 이 토픽의 글 중 AI 인용 여부를 실제로 확인한 글 수.
   * 0 이면 위 두 카운트의 0 은 '인용 0건'이 아니라 '아직 확인 안 함'이다 — 화면에서 반드시 구분할 것.
   * null 은 DB에 아직 ai_checked_count 컬럼이 없다는 뜻(마이그레이션 161 미적용) → 미확인과 동일하게 취급.
   */
  aiCheckedCount: number | null;
  challengeTop3Count: number;
  newPosts30d: number;
  isRepresentative: boolean;
  representativeScore: number;
}

const BASE_COLUMNS =
  'id, topic_type, name, post_count, last_post_at, avg_integrated_rank, avg_blog_rank, ai_briefing_count, ai_tab_count, challenge_top3_count, new_posts_30d, is_representative, representative_score';

/** PostgREST 는 없는 컬럼을 select 하면 42703 으로 쿼리 전체를 실패시킨다. */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

/**
 * select() 에 리터럴이 아닌 변수를 넘기면 supabase-js 가 행 타입을 추론하지 못하고
 * GenericStringError 로 떨어진다. 컬럼 목록이 두 가지(마이그레이션 적용 전/후)라 변수일 수밖에 없으므로
 * 행 타입은 여기서 직접 선언한다. ai_checked_count 만 optional — 폴백 쿼리에는 없다.
 */
type TopicRow = {
  id: string;
  topic_type: string;
  name: string;
  post_count: number;
  last_post_at: string | null;
  avg_integrated_rank: number | null;
  avg_blog_rank: number | null;
  ai_briefing_count: number;
  ai_tab_count: number;
  ai_checked_count?: number | null;
  challenge_top3_count: number;
  new_posts_30d: number;
  is_representative: boolean;
  representative_score: number;
};

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
  const query = async (columns: string) => {
    const { data, error } = await supabase
      .from('topics')
      .select(columns)
      .eq('user_id', auth.userId)
      .eq('blog_id', blogId)
      .order('is_representative', { ascending: false })
      .order('post_count', { ascending: false });
    return { data: data as unknown as TopicRow[] | null, error };
  };

  // 마이그레이션 161 이 아직 DB에 적용되지 않았어도 토픽 화면이 통째로 500 나지 않게 한다.
  // 이 저장소는 "마이그레이션 파일은 커밋됐는데 DB 미적용"으로 끝난 이력이 반복된다.
  let { data, error } = await query(`${BASE_COLUMNS}, ai_checked_count`);
  if (isUndefinedColumn(error)) ({ data, error } = await query(BASE_COLUMNS));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const topics: TopicSummary[] = (data || []).map(t => ({
    id: t.id,
    topicType: t.topic_type,
    name: t.name,
    postCount: t.post_count,
    lastPostAt: t.last_post_at,
    avgIntegratedRank: t.avg_integrated_rank,
    avgBlogRank: t.avg_blog_rank,
    aiBriefingCount: t.ai_briefing_count,
    aiTabCount: t.ai_tab_count,
    aiCheckedCount: t.ai_checked_count ?? null,
    challengeTop3Count: t.challenge_top3_count,
    newPosts30d: t.new_posts_30d,
    isRepresentative: t.is_representative,
    representativeScore: t.representative_score,
  }));

  return NextResponse.json({ topics });
}
