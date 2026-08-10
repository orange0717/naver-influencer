import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { fetchBlogProfileStats, getBlogVisitorSummary } from '@/lib/blog-crawler';
import { calculateMissingRate, type MissingResultsMap, type PostLike } from '@/lib/missing-rate';

export const dynamic = 'force-dynamic';

export interface BlogDashboardSummary {
  todayVisitors: number;
  thirtyDayVisitors: number;
  neighborCount: number;
  postCount: number;
  aiBriefingCitedCount: number;
  aiTabExposedCount: number;
  top10KeywordCount: number;
  avgRank: number | null;
  missingRate: number;
  challengeParticipatedCount: number;
}

/**
 * GET /api/my/blog-dashboard-summary?blogId=xxx
 * 통합 대시보드 상단 KPI 10종 — 기존 방문자/프로필/AI브리핑/키워드순위 데이터 + 누락률/키워드챌린지 참여를 한 번에 집계
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) {
    return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();

  // 누락률 카드용 influencerId 역조회 — users.linked_influencer_id 우선, 없으면 naver_id=blogId로 매칭
  // (/my/page.tsx의 대시보드 허브가 쓰는 것과 동일한 해석 규칙)
  const linkedInfluencerId = (auth.user as { linked_influencer_id?: string | null }).linked_influencer_id ?? null;
  const influencerIdPromise: Promise<string | null> = linkedInfluencerId
    ? Promise.resolve(linkedInfluencerId)
    : Promise.resolve(
        supabase
          .from('influencers')
          .select('id')
          .eq('naver_id', blogId)
          .maybeSingle(),
      ).then(({ data }) => data?.id ?? null);

  const [visitorSummary, profileStats, briefingRows, rankRows, missingCheckRows, influencerId] = await Promise.all([
    getBlogVisitorSummary(blogId, 30).catch(() => null),
    fetchBlogProfileStats(blogId).catch(() => null),
    supabase
      .from('ai_briefing_exposures')
      .select('post_id, exposed, tab_exposed')
      .eq('user_id', auth.userId)
      .eq('blog_id', blogId)
      .then(({ data }) => data ?? []),
    supabase
      .from('keyword_rank_lookups')
      .select('view_rank, blog_rank')
      .eq('user_id', auth.userId)
      .eq('blog_id', blogId)
      .then(({ data }) => data ?? []),
    // 누락률 카드 — 누락률 메뉴가 이미 검사 결과를 저장해두는 post_missing_checks를 재집계
    // (/my/page.tsx의 missingSummaryPromise와 동일한 규칙)
    supabase
      .from('post_missing_checks')
      .select('post_id, view_exposed, view_rank, blog_exposed, blog_rank')
      .eq('blog_id', blogId)
      .not('checked_at', 'is', null)
      .then(({ data }) => data ?? []),
    influencerIdPromise.catch(() => null),
  ]);

  // 키워드챌린지 참여 현황 — 최근 7일 스냅샷에서 keyword_id별 최신 1건만 남겨 distinct 카운트
  // (/my/page.tsx의 recentRowsPromise와 동일한 7일 윈도우 + dedup 규칙)
  const challengeSinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const challengeParticipatedCount = influencerId
    ? await supabase
        .from('keyword_rankings')
        .select('keyword_id')
        .eq('influencer_id', influencerId)
        .gte('snapshot_date', challengeSinceDate)
        .then(({ data }) => new Set((data ?? []).map(r => r.keyword_id)).size)
    : 0;

  // 포스트당 여러 키워드가 각각 행으로 저장되므로, 포스트 단위(distinct post_id)로 롤업해서 센다.
  // (한 포스트가 키워드 3개로 모두 인용되어도 "1건"으로 집계 — 2026-07-17 중복집계 버그 수정)
  const aiBriefingCitedCount = new Set(
    briefingRows.filter(r => r.exposed === true).map(r => r.post_id),
  ).size;
  const aiTabExposedCount = new Set(
    briefingRows.filter(r => r.tab_exposed === true).map(r => r.post_id),
  ).size;

  const bestRanks = rankRows
    .map(r => {
      const candidates = [r.view_rank, r.blog_rank].filter((v): v is number => typeof v === 'number');
      return candidates.length > 0 ? Math.min(...candidates) : null;
    })
    .filter((v): v is number => v !== null);

  const top10KeywordCount = bestRanks.filter(r => r <= 10).length;
  const avgRank = bestRanks.length > 0
    ? Math.round((bestRanks.reduce((s, r) => s + r, 0) / bestRanks.length) * 10) / 10
    : null;

  const missingResults: MissingResultsMap = {};
  const missingPosts: PostLike[] = [];
  for (const r of missingCheckRows) {
    missingResults[r.post_id] = {
      blogTab: { exposed: r.blog_exposed, rank: r.blog_rank },
      viewTab: { exposed: r.view_exposed, rank: r.view_rank },
    };
    missingPosts.push({ id: r.post_id });
  }
  const missingRate = missingPosts.length > 0 ? calculateMissingRate(missingPosts, missingResults) : 0;

  const summary: BlogDashboardSummary = {
    todayVisitors: visitorSummary?.todayVisitors ?? 0,
    thirtyDayVisitors: visitorSummary?.totalVisitors ?? 0,
    neighborCount: profileStats?.subscriberCount ?? 0,
    postCount: profileStats?.postCount ?? 0,
    aiBriefingCitedCount,
    aiTabExposedCount,
    top10KeywordCount,
    avgRank,
    missingRate,
    challengeParticipatedCount,
  };

  return NextResponse.json(summary);
}
