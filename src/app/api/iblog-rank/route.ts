import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { formatRankChange } from '@/lib/iblog-rank';

export const dynamic = 'force-dynamic';

/**
 * 블로그 순위 전체 랭킹 조회 (통합검색 노출량 기준)
 * GET /api/iblog-rank?date=YYYY-MM-DD&limit=50&offset=0
 * - date 미지정 시 최신 스냅샷
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if (gate.error) return gate.error;

  const supabase = createServiceClient();
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const dateParam = url.searchParams.get('date');

  let snapshotDate = dateParam;
  if (!snapshotDate) {
    const { data: latest } = await supabase
      .from('iblog_rank_daily')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotDate = latest?.snapshot_date ?? null;
  }

  if (!snapshotDate) {
    return NextResponse.json({ date: null, total: 0, limit, offset, rankings: [] });
  }

  const { data: rows, count, error } = await supabase
    .from('iblog_rank_daily')
    .select('blog_id, total_exposure, keyword_count, rank, previous_rank, rank_change', {
      count: 'exact',
    })
    .eq('snapshot_date', snapshotDate)
    .order('rank', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const blogIds = (rows || []).map((r) => r.blog_id);
  const nameMap = new Map<string, string | null>();
  if (blogIds.length > 0) {
    const { data: blogs } = await supabase
      .from('iblog_rank_blogs')
      .select('blog_id, blog_name')
      .in('blog_id', blogIds);
    for (const b of blogs || []) nameMap.set(b.blog_id, b.blog_name);
  }

  const rankings = (rows || []).map((r) => ({
    rank: r.rank,
    blogId: r.blog_id,
    blogName: nameMap.get(r.blog_id) ?? null,
    blogUrl: `https://blog.naver.com/${r.blog_id}`,
    totalExposure: r.total_exposure,
    keywordCount: r.keyword_count,
    previousRank: r.previous_rank,
    rankChange: r.rank_change,
    changeLabel: formatRankChange(r.previous_rank, r.rank_change),
  }));

  return NextResponse.json({
    date: snapshotDate,
    total: count ?? rankings.length,
    limit,
    offset,
    rankings,
  });
}
