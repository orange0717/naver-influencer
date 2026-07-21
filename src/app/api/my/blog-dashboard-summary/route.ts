import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { fetchBlogProfileStats, getBlogVisitorSummary } from '@/lib/blog-crawler';

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
}

/**
 * GET /api/my/blog-dashboard-summary?blogId=xxx
 * 통합 대시보드 상단 KPI 8종 — 기존 방문자/프로필/AI브리핑/키워드순위 데이터를 한 번에 집계
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

  const [visitorSummary, profileStats, briefingRows, rankRows] = await Promise.all([
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
  ]);

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

  const summary: BlogDashboardSummary = {
    todayVisitors: visitorSummary?.todayVisitors ?? 0,
    thirtyDayVisitors: visitorSummary?.totalVisitors ?? 0,
    neighborCount: profileStats?.subscriberCount ?? 0,
    postCount: profileStats?.postCount ?? 0,
    aiBriefingCitedCount,
    aiTabExposedCount,
    top10KeywordCount,
    avgRank,
  };

  return NextResponse.json(summary);
}
