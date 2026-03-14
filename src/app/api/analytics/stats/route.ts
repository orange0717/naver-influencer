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

    // 가입자 (users 테이블만 — 크롤링 인플루언서 제외)
    let totalSignups = 0;
    let todaySignups = 0;

    try {
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      totalSignups = count || 0;

      const { count: todayCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00+09:00`);
      todaySignups = todayCount || 0;
    } catch {
      // users 테이블 문제 시 0
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
