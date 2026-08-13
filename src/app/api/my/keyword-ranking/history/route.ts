import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/my/keyword-ranking/history?blogId=&postId=&keyword=
 * 키워드 상세(스펙 #27)용 순위 변화 시계열. keyword_rank_history(migration-123)에서
 * (user, blog, post, keyword)의 통합검색/블로그탭/인플루언서 순위 이력을 시간순으로 반환한다.
 * 향후 그래프 확장을 위해 search_type별 배열로 구조화한다.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) {
    return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  const keyword = request.nextUrl.searchParams.get('keyword')?.trim();
  if (!blogId || !postId || !keyword) {
    return NextResponse.json({ error: 'blogId, postId, keyword가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('keyword_rank_history')
    .select('search_type, rank, checked_at')
    .eq('user_id', auth.userId)
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .eq('keyword', keyword)
    .order('checked_at', { ascending: true });

  if (error) {
    console.error('[keyword-ranking/history] 조회 실패:', error);
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }

  // search_type별 시계열로 분리 (rank=null → 그 시점 미노출/조회범위밖)
  const series: Record<'integrated' | 'blog' | 'influencer', Array<{ rank: number | null; checkedAt: string }>> = {
    integrated: [], blog: [], influencer: [],
  };
  for (const row of (data ?? []) as Array<{ search_type: string; rank: number | null; checked_at: string }>) {
    if (row.search_type === 'integrated' || row.search_type === 'blog' || row.search_type === 'influencer') {
      series[row.search_type].push({ rank: row.rank, checkedAt: row.checked_at });
    }
  }

  return NextResponse.json({ keyword, postId, blogId, series });
}
