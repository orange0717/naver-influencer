import { NextRequest } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { rowsToCsv, csvResponse, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireInfluencerPlan(request);
  if (guard.error) return guard.error;

  const { authUser } = guard;
  const supabase = createServiceClient();

  // 인플루언서 ID 조회
  const { data: userRow } = await supabase
    .from('users')
    .select('linked_influencer_id')
    .eq('id', authUser.userId)
    .single();
  const influencerId = userRow?.linked_influencer_id;
  if (!influencerId) {
    return new Response(JSON.stringify({ error: '연결된 인플루언서가 없습니다.' }), { status: 400 });
  }

  // 최신 스냅샷 조회
  const { data: snapshotRow } = await supabase
    .from('keyword_rankings')
    .select('snapshot_date')
    .eq('influencer_id', influencerId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();
  const snapshotDate = snapshotRow?.snapshot_date;
  if (!snapshotDate) {
    const csv = rowsToCsv(['키워드', '카테고리', '통합검색순위', '블로그탭순위', '이전순위', '변동', 'TOP3', '월간검색량', '최근포스팅제목', '최근포스팅URL', '스냅샷날짜'], []);
    return csvResponse(`my_keyword_ranking_${todayStamp()}.csv`, csv);
  }

  const { data, error } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, previous_rank, rank_change, is_integrated_top3,
      blog_search_rank, view_tab_rank, latest_post_title, latest_post_url, snapshot_date,
      keyword_challenges(keyword, category, search_volume_monthly)
    `)
    .eq('influencer_id', influencerId)
    .eq('snapshot_date', snapshotDate)
    .order('rank_position', { ascending: true })
    .limit(DOWNLOAD_ROW_LIMIT);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const headers = ['키워드', '카테고리', '통합검색순위', '블로그탭순위', '이전순위', '변동', 'TOP3', '월간검색량', '최근포스팅제목', '최근포스팅URL', '스냅샷날짜'];
  const rows = (data || []).map((r: Record<string, unknown>) => {
    const kw = r.keyword_challenges as { keyword?: string; category?: string; search_volume_monthly?: number } | null;
    return [
      kw?.keyword ?? '',
      kw?.category ?? '',
      r.view_tab_rank ?? r.rank_position ?? '',
      r.blog_search_rank ?? '',
      r.previous_rank ?? '',
      r.rank_change ?? '',
      r.is_integrated_top3 ? 'Y' : '',
      kw?.search_volume_monthly ?? '',
      r.latest_post_title ?? '',
      r.latest_post_url ?? '',
      r.snapshot_date ?? '',
    ];
  });
  const csv = rowsToCsv(headers, rows);
  return csvResponse(`my_keyword_ranking_${todayStamp()}.csv`, csv);
}
