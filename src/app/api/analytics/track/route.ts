import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const BOT_PATTERNS = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|vercel|uptime|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Telegram|Yandex|Baidu|DuckDuckBot|Sogou|Bytespider|PetalBot|GPTBot|ChatGPT|ClaudeBot|Applebot|Amazonbot|SemrushBot|AhrefsBot|MJ12bot|DotBot|Rogerbot|DataForSeoBot|archive\.org|Mediapartners|AdsBot|Screaming Frog|CCBot|Barkrowler|Go-http-client|python-requests|curl|wget|axios|node-fetch|undici|httpx/i;

/** 페이지 방문 추적 (VisitTracker에서 호출) */
export async function POST(req: NextRequest) {
  try {
    // Rate Limiting
    const ip = getClientIp(req);
    if (await dashboardLimiter.check(`track:${ip}`)) {
      return NextResponse.json({ ok: true, skipped: 'rate_limit' });
    }

    // 봇·크롤러·프리뷰 요청 필터링
    const ua = req.headers.get('user-agent') || '';
    if (!ua || BOT_PATTERNS.test(ua)) {
      return NextResponse.json({ ok: true, skipped: 'bot' });
    }

    const body = await req.json().catch(() => ({}));
    const supabase = createServiceClient();
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = kst.toISOString().slice(0, 10);

    // 1) site_visits 일별 집계 — 세션 첫 방문(순 방문자)일 때만 카운트
    const isFirstVisit = body.first_visit === true;
    const deviceType = ['mobile', 'tablet', 'desktop'].includes(body.device_type)
      ? body.device_type
      : 'desktop';

    if (isFirstVisit) {
      const { error } = await supabase.rpc('increment_visit', { p_date: today, p_device: deviceType });

      if (error) {
        const { data: existing } = await supabase
          .from('site_visits')
          .select('visit_count, desktop_count, mobile_count, tablet_count')
          .eq('visit_date', today)
          .single();

        if (existing) {
          const deviceKey = `${deviceType}_count` as keyof typeof existing;
          await supabase
            .from('site_visits')
            .update({
              visit_count: (existing.visit_count || 0) + 1,
              [deviceKey]: ((existing[deviceKey] as number) || 0) + 1,
            })
            .eq('visit_date', today);
        } else {
          await supabase
            .from('site_visits')
            .insert({
              visit_date: today,
              visit_count: 1,
              unique_visitors: 1,
              desktop_count: deviceType === 'desktop' ? 1 : 0,
              mobile_count: deviceType === 'mobile' ? 1 : 0,
              tablet_count: deviceType === 'tablet' ? 1 : 0,
            });
        }
      }
    }

    // 2) visit_logs 개별 기록 (유입경로 추적)
    const pagePath = typeof body.path === 'string' ? body.path.slice(0, 500) : '/';
    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 1000) : '';
    const referrerDomain = typeof body.referrer_domain === 'string' ? body.referrer_domain.slice(0, 200) : null;
    const utmSource = typeof body.utm_source === 'string' ? body.utm_source.slice(0, 100) : null;
    const utmMedium = typeof body.utm_medium === 'string' ? body.utm_medium.slice(0, 100) : null;
    const utmCampaign = typeof body.utm_campaign === 'string' ? body.utm_campaign.slice(0, 200) : null;

    await supabase.from('visit_logs').insert({
      page_path: pagePath,
      referrer: referrer || null,
      referrer_domain: referrerDomain,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      device_type: deviceType,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
