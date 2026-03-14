import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceClient();
    const today = new Date().toISOString().slice(0, 10);

    // 오늘 방문자 (site_visits 테이블)
    let todayVisits = 0;
    let totalVisits = 0;

    try {
      const { data: todayRow } = await supabase
        .from('site_visits')
        .select('visit_count')
        .eq('visit_date', today)
        .single();
      todayVisits = todayRow?.visit_count || 0;

      // 누적 방문자 (전체 합계)
      const { data: allRows } = await supabase
        .from('site_visits')
        .select('visit_count');
      totalVisits = (allRows || []).reduce((sum, r) => sum + (r.visit_count || 0), 0);
    } catch {
      // site_visits 테이블 없으면 0
    }

    // 가입자 (users + 인플루언서 로그인 합산)
    let totalSignups = 0;
    let todaySignups = 0;

    try {
      // users 테이블
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      const { count: todayUserCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00+09:00`);

      // 인플루언서 중 first_seen_at이 있는 등록자 (로그인한 인플루언서)
      const { count: infCount } = await supabase
        .from('influencers')
        .select('*', { count: 'exact', head: true })
        .not('first_seen_at', 'is', null);

      const { count: todayInfCount } = await supabase
        .from('influencers')
        .select('*', { count: 'exact', head: true })
        .not('first_seen_at', 'is', null)
        .gte('first_seen_at', `${today}T00:00:00+09:00`);

      totalSignups = (userCount || 0) + (infCount || 0);
      todaySignups = (todayUserCount || 0) + (todayInfCount || 0);
    } catch {
      // 테이블 문제 시 0
    }

    return NextResponse.json({
      todayVisits,
      totalVisits,
      todaySignups,
      totalSignups,
    });
  } catch {
    return NextResponse.json({
      todayVisits: 0,
      totalVisits: 0,
      todaySignups: 0,
      totalSignups: 0,
    });
  }
}
