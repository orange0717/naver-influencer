import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type HistoryRow = {
  post_id: string;
  keyword: string;
  exposed: boolean | null;
  tab_exposed: boolean | null;
  checked_at: string;
};

/**
 * GET /api/my/ai-briefing-history?blogId=[&postId=&keyword=]
 * 인용 상태 변경 이력(ai_briefing_exposure_history)을 (post_id::keyword)별로 묶어 반환한다.
 * PATCH가 exposed/tab_exposed가 직전과 달라질 때만 스냅샷을 남기므로, 각 배열은 곧 "변화 타임라인"이다.
 * UI에서 "8/10 미인용 → 8/11 인용" 형태로 렌더한다(오래된 순).
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
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  const keyword = request.nextUrl.searchParams.get('keyword')?.trim();

  const supabase = createServiceClient();
  let q = supabase
    .from('ai_briefing_exposure_history')
    .select('post_id, keyword, exposed, tab_exposed, checked_at')
    .eq('user_id', auth.userId)
    .eq('blog_id', blogId)
    .order('checked_at', { ascending: true });
  if (postId) q = q.eq('post_id', postId);
  if (keyword) q = q.eq('keyword', keyword);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: '이력 조회에 실패했습니다.' }, { status: 500 });

  // "postId::keyword" → 오래된→최신 순 스냅샷 배열
  const history: Record<string, Array<{ exposed: boolean | null; tabExposed: boolean | null; checkedAt: string }>> = {};
  for (const r of (data ?? []) as HistoryRow[]) {
    (history[`${r.post_id}::${r.keyword}`] ??= []).push({
      exposed: r.exposed,
      tabExposed: r.tab_exposed,
      checkedAt: r.checked_at,
    });
  }

  return NextResponse.json({ history });
}
