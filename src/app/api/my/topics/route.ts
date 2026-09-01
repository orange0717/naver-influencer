import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { queryTopicsWithFallback } from '@/lib/topic-columns';

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
  /** null = 아직 측정한 적 없음. 0 과 구분해야 한다. */
  challengeTop3Count: number | null;
  newPosts30d: number | null;
  isRepresentative: boolean;
  representativeScore: number | null;
}

const CORE_COLUMNS = 'id, topic_type, name, post_count, last_post_at';

/**
 * select() 에 리터럴이 아닌 변수를 넘기면 supabase-js 가 행 타입을 추론하지 못하고
 * GenericStringError 로 떨어진다. 컬럼 목록이 두 가지(마이그레이션 적용 전/후)라 변수일 수밖에 없으므로
 * 행 타입은 여기서 직접 선언한다. 마이그레이션 적용 단계에 따라 컬럼 목록이 3가지라
 * core 이외의 컬럼은 전부 optional 이다.
 */
type TopicRow = {
  id: string;
  topic_type: string;
  name: string;
  post_count: number;
  last_post_at: string | null;
  avg_integrated_rank?: number | null;
  avg_blog_rank?: number | null;
  ai_briefing_count?: number | null;
  ai_tab_count?: number | null;
  ai_checked_count?: number | null;
  challenge_top3_count?: number | null;
  new_posts_30d?: number | null;
  is_representative?: boolean | null;
  representative_score?: number | null;
};

/**
 * GET /api/my/topics?blogId=xxx
 * curate-blog-topics 크론이 채우는 topics 테이블을 그대로 반환 — 별도 실시간 재계산 없음.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const gate = await requireFeature(request, 'topics.mine');
  if (gate.error) return gate.error;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();

  // 마이그레이션 132(성과 지표)·161(ai_checked_count) 중 무엇이 DB에 안 들어가 있어도
  // 토픽 목록이 통째로 500 나지 않게 컬럼을 단계적으로 줄여 재시도한다.
  // 이 저장소는 "마이그레이션 파일은 커밋됐는데 DB 미적용"으로 끝난 이력이 반복된다.
  const { data, error, tier } = await queryTopicsWithFallback<TopicRow[]>(CORE_COLUMNS, async (columns, t) => {
    let q = supabase.from('topics').select(columns).eq('user_id', gate.authUser.userId).eq('blog_id', blogId);
    // order 도 컬럼이 없으면 똑같이 42703 으로 죽는다.
    if (t !== 'core_only') q = q.order('is_representative', { ascending: false });
    const { data: rows, error: err } = await q.order('post_count', { ascending: false });
    return { data: rows as unknown as TopicRow[] | null, error: err };
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 성과 지표 컬럼이 없으면 0 이 아니라 null(=미측정)로 내보낸다.
  const hasPerf = tier !== 'core_only';
  const topics: TopicSummary[] = (data || []).map(t => ({
    id: t.id,
    topicType: t.topic_type,
    name: t.name,
    postCount: t.post_count,
    lastPostAt: t.last_post_at,
    avgIntegratedRank: hasPerf ? (t.avg_integrated_rank ?? null) : null,
    avgBlogRank: hasPerf ? (t.avg_blog_rank ?? null) : null,
    aiBriefingCount: t.ai_briefing_count ?? 0,
    aiTabCount: t.ai_tab_count ?? 0,
    aiCheckedCount: t.ai_checked_count ?? null,
    challengeTop3Count: hasPerf ? (t.challenge_top3_count ?? 0) : null,
    newPosts30d: hasPerf ? (t.new_posts_30d ?? 0) : null,
    isRepresentative: !!t.is_representative,
    representativeScore: hasPerf ? (t.representative_score ?? 0) : null,
  }));

  // 소비자(데스크톱 앱 등)가 '측정해서 0' 과 '아직 측정 못 함' 을 구분할 수 있어야 한다.
  return NextResponse.json({ topics, metricsAvailable: hasPerf });
}
