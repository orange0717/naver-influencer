import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = kst.toISOString().slice(0, 10);

    // 어제 날짜
    const yesterdayDate = new Date(kst.getTime() - 86400000).toISOString().slice(0, 10);

    // UV(순방문자) + PV(페이지뷰) 양쪽 집계
    let todayVisits = 0;
    let yesterdayVisits = 0;
    let totalVisits = 0;
    let todayPageviews = 0;
    let yesterdayPageviews = 0;
    let totalPageviews = 0;
    const devices = { desktop: 0, mobile: 0, tablet: 0 };        // UV 기준 (세션 첫 방문)
    const devicesPV = { desktop: 0, mobile: 0, tablet: 0 };       // PV 기준

    try {
      const { data: todayRow } = await supabase
        .from('site_visits')
        .select('visit_count, pageview_count')
        .eq('visit_date', today)
        .single();
      todayVisits = todayRow?.visit_count || 0;
      todayPageviews = todayRow?.pageview_count || 0;

      const { data: yesterdayRow } = await supabase
        .from('site_visits')
        .select('visit_count, pageview_count')
        .eq('visit_date', yesterdayDate)
        .single();
      yesterdayVisits = yesterdayRow?.visit_count || 0;
      yesterdayPageviews = yesterdayRow?.pageview_count || 0;

      // 누적 합계
      const { data: allRows } = await supabase
        .from('site_visits')
        .select('visit_count, pageview_count, desktop_count, mobile_count, tablet_count, desktop_pv, mobile_pv, tablet_pv');
      totalVisits = (allRows || []).reduce((sum, r) => sum + (r.visit_count || 0), 0);
      totalPageviews = (allRows || []).reduce((sum, r) => sum + (r.pageview_count || 0), 0);
      devices.desktop = (allRows || []).reduce((sum, r) => sum + (r.desktop_count || 0), 0);
      devices.mobile = (allRows || []).reduce((sum, r) => sum + (r.mobile_count || 0), 0);
      devices.tablet = (allRows || []).reduce((sum, r) => sum + (r.tablet_count || 0), 0);
      devicesPV.desktop = (allRows || []).reduce((sum, r) => sum + (r.desktop_pv || 0), 0);
      devicesPV.mobile = (allRows || []).reduce((sum, r) => sum + (r.mobile_pv || 0), 0);
      devicesPV.tablet = (allRows || []).reduce((sum, r) => sum + (r.tablet_pv || 0), 0);
    } catch {
      // site_visits 테이블 없으면 0
    }

    // 가입자 (users 테이블만 — 크롤링 인플루언서 제외)
    let totalSignups = 0;
    let todaySignups = 0;
    let yesterdaySignups = 0;

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

      const { count: yesterdayCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${yesterdayDate}T00:00:00+09:00`)
        .lt('created_at', `${today}T00:00:00+09:00`);
      yesterdaySignups = yesterdayCount || 0;
    } catch {
      // users 테이블 문제 시 0
    }

    // 일별 방문 추이 (site_visits 테이블)
    let daily: { date: string; count: number; pageviews: number }[] = [];
    const includeDays = request.nextUrl.searchParams.get('days');
    let periodLabel: string | null = null;
    if (includeDays) {
      try {
        const daysNum = Math.min(Number(includeDays) || 30, 90);
        periodLabel = `최근 ${daysNum}일`;
        const since = new Date(kst.getTime() - daysNum * 86400000).toISOString().slice(0, 10);
        const { data: dailyRows } = await supabase
          .from('site_visits')
          .select('visit_date, visit_count, pageview_count, desktop_count, mobile_count, tablet_count, desktop_pv, mobile_pv, tablet_pv')
          .gte('visit_date', since)
          .order('visit_date', { ascending: true });
        daily = (dailyRows || []).map(r => ({
          date: r.visit_date,
          count: r.visit_count || 0,
          pageviews: r.pageview_count || 0,
        }));
        // 기간별 기기 집계 (UV / PV 각각)
        devices.desktop = (dailyRows || []).reduce((sum, r) => sum + (r.desktop_count || 0), 0);
        devices.mobile = (dailyRows || []).reduce((sum, r) => sum + (r.mobile_count || 0), 0);
        devices.tablet = (dailyRows || []).reduce((sum, r) => sum + (r.tablet_count || 0), 0);
        devicesPV.desktop = (dailyRows || []).reduce((sum, r) => sum + (r.desktop_pv || 0), 0);
        devicesPV.mobile = (dailyRows || []).reduce((sum, r) => sum + (r.mobile_pv || 0), 0);
        devicesPV.tablet = (dailyRows || []).reduce((sum, r) => sum + (r.tablet_pv || 0), 0);
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      todayVisits,
      yesterdayVisits,
      totalVisits,
      todayPageviews,
      yesterdayPageviews,
      totalPageviews,
      todaySignups,
      yesterdaySignups,
      totalSignups,
      devices,
      devicesPV,
      ...(periodLabel ? { periodLabel } : {}),
      ...(daily.length > 0 ? { daily } : {}),
    });
  } catch {
    return NextResponse.json({
      todayVisits: 0,
      totalVisits: 0,
      todayPageviews: 0,
      totalPageviews: 0,
      todaySignups: 0,
      totalSignups: 0,
    });
  }
}
