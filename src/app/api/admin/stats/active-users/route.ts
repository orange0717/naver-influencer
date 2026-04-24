import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * 관리자용 활성 사용자 통계
 * - DAU: 오늘(KST) 방문한 유저 수
 * - WAU: 최근 7일 방문한 유저 수
 * - MAU: 최근 30일 방문한 유저 수
 * - todayVisitors: 오늘 방문한 유저 상세 (닉네임/이메일/마지막 페이지/방문시각)
 *
 * last_visited_at 은 로그인 상태에서 페이지를 열 때마다 갱신되므로,
 * "last_visited_at >= period_start" 로 해당 기간의 활성 유저를 정확히 셀 수 있다.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  // KST 기준 오늘 자정 계산 (UTC+9)
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const todayKstMid = new Date(Math.floor(kstMs / 86400000) * 86400000 - 9 * 60 * 60 * 1000);
  const weekStart = new Date(todayKstMid.getTime() - 6 * 86400000); // 오늘 포함 7일
  const monthStart = new Date(todayKstMid.getTime() - 29 * 86400000); // 오늘 포함 30일

  // 3개 카운트 + 오늘 방문자 목록 병렬 조회
  const [dauRes, wauRes, mauRes, visitorsRes] = await Promise.all([
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_visited_at', todayKstMid.toISOString()),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_visited_at', weekStart.toISOString()),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_visited_at', monthStart.toISOString()),
    supabase
      .from('users')
      .select('id, nickname, email, last_visited_at, total_visit_count, total_session_count')
      .gte('last_visited_at', todayKstMid.toISOString())
      .order('last_visited_at', { ascending: false })
      .limit(100),
  ]);

  if (dauRes.error || wauRes.error || mauRes.error || visitorsRes.error) {
    console.error('[admin/stats/active-users] error', {
      dau: dauRes.error,
      wau: wauRes.error,
      mau: mauRes.error,
      visitors: visitorsRes.error,
    });
    return NextResponse.json({ error: '통계 조회 실패' }, { status: 500 });
  }

  // 오늘 방문자별 최근 visit_logs 항목(마지막 페이지) 조회
  const visitors = visitorsRes.data || [];
  const userIds = visitors.map(v => v.id);
  const lastPageMap = new Map<string, { path: string; visitedAt: string }>();

  if (userIds.length > 0) {
    const { data: logs } = await supabase
      .from('visit_logs')
      .select('user_id, page_path, visited_at')
      .in('user_id', userIds)
      .gte('visited_at', todayKstMid.toISOString())
      .order('visited_at', { ascending: false });

    for (const log of logs || []) {
      if (!lastPageMap.has(log.user_id)) {
        lastPageMap.set(log.user_id, { path: log.page_path, visitedAt: log.visited_at });
      }
    }
  }

  const todayVisitors = visitors.map(v => ({
    id: v.id,
    nickname: v.nickname,
    email: v.email,
    last_visited_at: v.last_visited_at,
    last_page: lastPageMap.get(v.id)?.path || null,
    session_count: v.total_session_count || 0,
    pageview_count: v.total_visit_count || 0,
  }));

  return NextResponse.json({
    dau: dauRes.count || 0,
    wau: wauRes.count || 0,
    mau: mauRes.count || 0,
    todayVisitors,
  });
}
