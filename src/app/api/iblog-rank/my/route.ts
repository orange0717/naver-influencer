import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { formatRankChange } from '@/lib/iblog-rank';

export const dynamic = 'force-dynamic';

/**
 * 내 블로그 순위 (블로그 대시보드 위젯용)
 * GET /api/iblog-rank/my[?blogId=xxx]
 * - 내 blog_id: users.blog_id 우선 → iblog_rank_blogs.owner_user_id 연결 → ?blogId 파라미터
 * - 최신 순위 + 전일 대비 + 키워드별 노출 상세 + 순위 추이(최근 14일)
 */
export async function GET(request: NextRequest) {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(request.url);

  let blogId =
    (authUser.user as { blog_id?: string | null }).blog_id?.toLowerCase() || null;

  if (!blogId) {
    const { data: owned } = await supabase
      .from('iblog_rank_blogs')
      .select('blog_id')
      .eq('owner_user_id', authUser.userId)
      .maybeSingle();
    blogId = owned?.blog_id ?? null;
  }

  const qBlogId = url.searchParams.get('blogId');
  if (!blogId && qBlogId) blogId = qBlogId.trim().toLowerCase();

  if (!blogId) {
    return NextResponse.json({
      connected: false,
      blogId: null,
      rank: null,
      message: '연결된 블로그가 없습니다.',
    });
  }

  const { data: latest } = await supabase
    .from('iblog_rank_daily')
    .select('snapshot_date, total_exposure, keyword_count, rank, previous_rank, rank_change')
    .eq('blog_id', blogId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let keywordBreakdown: Array<{
    keyword: string;
    exposureCount: number;
    bestPosition: number | null;
  }> = [];

  if (latest) {
    const { data: kwRows } = await supabase
      .from('iblog_rank_results')
      .select('keyword, exposure_count, best_position')
      .eq('blog_id', blogId)
      .eq('snapshot_date', latest.snapshot_date)
      .order('exposure_count', { ascending: false });
    keywordBreakdown = (kwRows || []).map((k) => ({
      keyword: k.keyword,
      exposureCount: k.exposure_count,
      bestPosition: k.best_position,
    }));
  }

  const { data: history } = await supabase
    .from('iblog_rank_history')
    .select('snapshot_date, rank, total_exposure, rank_change')
    .eq('blog_id', blogId)
    .order('snapshot_date', { ascending: false })
    .limit(14);

  return NextResponse.json({
    connected: true,
    blogId,
    blogUrl: `https://blog.naver.com/${blogId}`,
    date: latest?.snapshot_date ?? null,
    rank: latest?.rank ?? null,
    totalExposure: latest?.total_exposure ?? 0,
    keywordCount: latest?.keyword_count ?? 0,
    previousRank: latest?.previous_rank ?? null,
    rankChange: latest?.rank_change ?? null,
    changeLabel: latest
      ? formatRankChange(latest.previous_rank, latest.rank_change)
      : null,
    keywordBreakdown,
    history: (history || []).slice().reverse(),
  });
}
