import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 유입경로 통계 API
 * GET /api/analytics/referrers?days=7
 */
export async function GET(req: NextRequest) {
  try {
    const days = Math.min(Number(req.nextUrl.searchParams.get('days')) || 7, 90);
    // KST 자정 기준 (UTC 서버에서도 정확하게 동작)
    const now = new Date();
    const kstDateStr = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
    const kstMidnightUTC = new Date(kstDateStr + 'T00:00:00Z');
    kstMidnightUTC.setHours(kstMidnightUTC.getHours() - 9); // KST 자정 = UTC 15:00 전날

    // days=1: 오늘만, days=2: 어제만, days=N: 최근 N일
    let since: string;
    let until: string | null = null;
    if (days === 1) {
      since = kstMidnightUTC.toISOString();
    } else if (days === 2) {
      // 어제: 어제 자정 ~ 오늘 자정
      since = new Date(kstMidnightUTC.getTime() - 86400000).toISOString();
      until = kstMidnightUTC.toISOString();
    } else {
      since = new Date(kstMidnightUTC.getTime() - (days - 1) * 86400000).toISOString();
    }

    const supabase = createServiceClient();

    // Supabase 기본 1000행 제한 → 명시적으로 충분한 수 지정
    let query = supabase
      .from('visit_logs')
      .select('referrer, referrer_domain, utm_source, utm_medium, utm_campaign, device_type, page_path')
      .gte('visited_at', since)
      .order('visited_at', { ascending: false })
      .limit(10000);
    if (until) {
      query = query.lt('visited_at', until);
    }
    const { data: logs } = await query;

    if (!logs || logs.length === 0) {
      return NextResponse.json({
        total: 0,
        referrers: [],
        utm_sources: [],
        devices: {},
        pages: [],
      });
    }

    // 1) referrer 도메인별 집계
    const refMap = new Map<string, number>();
    for (const log of logs) {
      const domain = log.referrer_domain || 'direct';
      refMap.set(domain, (refMap.get(domain) || 0) + 1);
    }
    const referrers = [...refMap.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 1-b) referrer 전체 URL별 집계 (direct 제외)
    const refUrlMap = new Map<string, number>();
    for (const log of logs) {
      if (log.referrer) {
        refUrlMap.set(log.referrer, (refUrlMap.get(log.referrer) || 0) + 1);
      }
    }
    const referrer_urls = [...refUrlMap.entries()]
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    // 2) UTM source별 집계
    const utmMap = new Map<string, number>();
    for (const log of logs) {
      if (log.utm_source) {
        const key = [log.utm_source, log.utm_medium, log.utm_campaign].filter(Boolean).join(' / ');
        utmMap.set(key, (utmMap.get(key) || 0) + 1);
      }
    }
    const utm_sources = [...utmMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 3) 디바이스 타입별 비율
    const deviceMap: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
    for (const log of logs) {
      const dt = log.device_type || 'desktop';
      deviceMap[dt] = (deviceMap[dt] || 0) + 1;
    }

    // 4) 페이지별 방문수
    const pageMap = new Map<string, number>();
    for (const log of logs) {
      const p = log.page_path || '/';
      pageMap.set(p, (pageMap.get(p) || 0) + 1);
    }
    const pages = [...pageMap.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return NextResponse.json({
      total: logs.length,
      days,
      referrers,
      referrer_urls,
      utm_sources,
      devices: deviceMap,
      pages,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
