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
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const supabase = createServiceClient();

    const { data: logs } = await supabase
      .from('visit_logs')
      .select('referrer_domain, utm_source, utm_medium, utm_campaign, device_type, page_path')
      .gte('visited_at', since);

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
      utm_sources,
      devices: deviceMap,
      pages,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
