import { NextRequest } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { rowsToCsv, csvResponse, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const HEADERS = ['제목', '검색 키워드', '통합검색', '블로그', '인플루언서', '전일대비', '7일대비', '검색량', '업데이트'];

function formatDelta(currentExposed: boolean, currentRank: number | null, refRank: number | null, refCheckedAt: string | null): string {
  if (!refCheckedAt) return '-';
  if (currentExposed && refRank != null && currentRank != null) {
    const delta = refRank - currentRank;
    if (delta > 0) return `▲${delta}`;
    if (delta < 0) return `▼${Math.abs(delta)}`;
    return '-';
  }
  if (currentExposed && refRank == null) return 'NEW';
  if (!currentExposed && refRank != null) return 'OUT';
  return '-';
}

/**
 * GET /api/downloads/my-keyword-ranking?blogId=...
 * /my/keyword-ranking 전체 리포트 — 현재 페이지에 국한되지 않고 해당 블로그의 저장된 키워드 전체를 CSV로 내려받는다.
 * (CSV 다운로드 버튼과 동일한 컬럼 구성, DOWNLOAD_ROW_LIMIT까지)
 */
export async function GET(request: NextRequest) {
  const guard = await requireInfluencerPlan(request);
  if (guard.error) return guard.error;

  const { authUser } = guard;
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) {
    return new Response(JSON.stringify({ error: 'blogId가 필요합니다.' }), { status: 400 });
  }

  const supabase = createServiceClient();
  const [{ data: lookups, error }, { data: deltaRows, error: deltaError }] = await Promise.all([
    supabase
      .from('keyword_rank_lookups')
      .select('post_id, keyword, view_rank, view_exposed, blog_rank, blog_exposed, influencer_rank, influencer_exposed, search_volume, checked_at')
      .eq('user_id', authUser.userId)
      .eq('blog_id', blogId)
      .not('checked_at', 'is', null)
      .order('checked_at', { ascending: false })
      .limit(DOWNLOAD_ROW_LIMIT),
    supabase.rpc('get_keyword_rank_deltas', { p_user_id: authUser.userId, p_blog_id: blogId }),
  ]);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (deltaError) console.error('[downloads/my-keyword-ranking] get_keyword_rank_deltas 실패:', deltaError);

  // 포스트 제목 조회 (post_id → title) — check-missing 호출 시마다 적재되는 post_missing_checks를 캐시로 재사용
  // (별도 Naver 실시간 조회 없이도 대부분 채워짐: /my/keyword-ranking 순위 확인 자체가 이 테이블에 기록을 남기기 때문)
  const postIds = [...new Set((lookups ?? []).map(r => r.post_id))];
  const titleByPostId = new Map<string, string>();
  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from('post_missing_checks')
      .select('post_id, post_title')
      .eq('blog_id', blogId)
      .in('post_id', postIds);
    for (const p of (posts ?? []) as Array<{ post_id: string; post_title: string | null }>) {
      if (p.post_title) titleByPostId.set(p.post_id, p.post_title);
    }
  }

  const deltaMap = new Map<string, { prevRank: number | null; prevCheckedAt: string | null; weekRank: number | null; weekCheckedAt: string | null }>();
  for (const d of (deltaRows ?? []) as Array<{
    post_id: string; keyword: string; search_type: string;
    prev_rank: number | null; prev_checked_at: string | null;
    week_rank: number | null; week_checked_at: string | null;
  }>) {
    if (d.search_type !== 'integrated') continue;
    deltaMap.set(`${d.post_id}::${d.keyword}`, {
      prevRank: d.prev_rank, prevCheckedAt: d.prev_checked_at,
      weekRank: d.week_rank, weekCheckedAt: d.week_checked_at,
    });
  }

  const rows = (lookups ?? []).map((r: {
    post_id: string; keyword: string;
    view_rank: number | null; view_exposed: boolean | null;
    blog_rank: number | null; blog_exposed: boolean | null;
    influencer_rank: number | null; influencer_exposed: boolean | null;
    search_volume: number | null; checked_at: string | null;
  }) => {
    const delta = deltaMap.get(`${r.post_id}::${r.keyword}`);
    return [
      titleByPostId.get(r.post_id) ?? '',
      r.keyword,
      r.view_exposed ? `${r.view_rank}위` : '-',
      r.blog_exposed ? `${r.blog_rank}위` : '-',
      r.influencer_exposed ? `${r.influencer_rank}위` : '-',
      formatDelta(!!r.view_exposed, r.view_rank, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null),
      formatDelta(!!r.view_exposed, r.view_rank, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null),
      r.search_volume ?? '',
      r.checked_at ? new Date(r.checked_at).toLocaleString('ko-KR') : '',
    ];
  });

  const csv = rowsToCsv(HEADERS, rows);
  return csvResponse(`my_keyword_ranking_전체리포트_${todayStamp()}.csv`, csv);
}
