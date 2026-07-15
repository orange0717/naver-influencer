import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { classifyReferrer, type ReferrerCategory } from '@/lib/referrer-classify';

export const dynamic = 'force-dynamic';

/** user-agent -> OS 분류 */
function parseOS(ua: string | null | undefined): string {
  if (!ua) return '기타';
  if (/iPhone|iPad|iPod|iOS/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows NT|Win64|Win32/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return '기타';
}

/** user-agent -> 브라우저 분류 (순서 중요) */
function parseBrowser(ua: string | null | undefined): string {
  if (!ua) return '기타';
  if (/Edg\/|Edge\/|EdgA\/|EdgiOS\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Whale/i.test(ua)) return 'Whale';
  if (/FxiOS|Firefox/i.test(ua)) return 'Firefox';
  if (/CriOS|Chrome|Chromium/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return '기타';
}

/**
 * 유입경로 통계 API
 * GET /api/analytics/referrers?days=7
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

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

    // 유입경로/OS/브라우저/인기페이지는 "세션 첫 방문 기준"으로 집계해야 의미가 있으므로
    // is_first_visit=true 만 필터. (migration-067 이후 visit_logs는 모든 PV를 저장함)
    let query = supabase
      .from('visit_logs')
      .select('referrer, referrer_domain, utm_source, utm_medium, utm_campaign, device_type, page_path, user_agent')
      .gte('visited_at', since)
      .eq('is_first_visit', true)
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
        channels: [],
        utm_sources: [],
        devices: {},
        pages: [],
        os_stats: [],
        browser_stats: [],
        device_os_stats: [],
        device_browser_stats: [],
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

    // 1-a) 채널 자동분류 (검색엔진 / AI / SNS / 외부 / 직접) — 도메인 목록으로 흩어지던 유입을 채널 단위로 재집계
    const CHANNEL_LABEL: Record<ReferrerCategory, string> = {
      search: '검색엔진',
      ai: 'AI',
      sns: 'SNS',
      external: '외부 사이트',
      direct: '직접 방문',
    };
    const CHANNEL_ORDER: ReferrerCategory[] = ['search', 'ai', 'sns', 'external', 'direct'];
    const channelMap = new Map<ReferrerCategory, Map<string, number>>();
    for (const log of logs) {
      const { category, label } = classifyReferrer(log.referrer, log.referrer_domain);
      if (!channelMap.has(category)) channelMap.set(category, new Map());
      const inner = channelMap.get(category)!;
      inner.set(label, (inner.get(label) || 0) + 1);
    }
    const channels = CHANNEL_ORDER.filter(cat => channelMap.has(cat)).map(cat => {
      const inner = channelMap.get(cat)!;
      const items = [...inner.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      const total = items.reduce((sum, it) => sum + it.count, 0);
      return { category: cat, label: CHANNEL_LABEL[cat], total, items };
    }).sort((a, b) => b.total - a.total);

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

    // 3-b) OS / 브라우저 집계 (user_agent 파싱) + 교차집계 (기기 × OS, 기기 × 브라우저)
    const osMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const deviceOsMap: Record<string, Map<string, number>> = {};
    const deviceBrowserMap: Record<string, Map<string, number>> = {};
    for (const log of logs as Array<{ user_agent?: string | null; device_type?: string | null }>) {
      const ua = log.user_agent || '';
      const os = parseOS(ua);
      const br = parseBrowser(ua);
      const dev = log.device_type || 'desktop';
      osMap.set(os, (osMap.get(os) || 0) + 1);
      browserMap.set(br, (browserMap.get(br) || 0) + 1);
      if (!deviceOsMap[dev]) deviceOsMap[dev] = new Map();
      if (!deviceBrowserMap[dev]) deviceBrowserMap[dev] = new Map();
      deviceOsMap[dev].set(os, (deviceOsMap[dev].get(os) || 0) + 1);
      deviceBrowserMap[dev].set(br, (deviceBrowserMap[dev].get(br) || 0) + 1);
    }
    const os_stats = [...osMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const browser_stats = [...browserMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const toCross = (m: Record<string, Map<string, number>>) =>
      Object.entries(m).map(([device, inner]) => ({
        device,
        total: [...inner.values()].reduce((a, b) => a + b, 0),
        items: [...inner.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      })).sort((a, b) => b.total - a.total);
    const device_os_stats = toCross(deviceOsMap);
    const device_browser_stats = toCross(deviceBrowserMap);

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
      channels,
      referrer_urls,
      utm_sources,
      devices: deviceMap,
      pages,
      os_stats,
      browser_stats,
      device_os_stats,
      device_browser_stats,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
