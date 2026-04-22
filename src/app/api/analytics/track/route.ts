import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp } from '@/lib/rate-limit';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

/**
 * Supabase Auth 실패 시 쿠키 세션(데모/블로거)을 users.id로 매핑한다.
 * 네이버 로그인: naver_id -> influencers.id -> users.linked_influencer_id
 * 블로거 로그인: blog_id -> users.blog_id
 */
async function resolveCookieUserId(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<string | null> {
  const cookieUser = await getCookieUser().catch(() => null);
  if (!cookieUser) return null;

  if (cookieUser.type === 'influencer') {
    const { data: inf } = await supabase
      .from('influencers')
      .select('id')
      .eq('naver_id', cookieUser.id)
      .maybeSingle();
    if (!inf) return null;
    const { data: u } = await supabase
      .from('users')
      .select('id')
      .eq('linked_influencer_id', inf.id)
      .maybeSingle();
    return u?.id ?? null;
  }

  if (cookieUser.type === 'blogger') {
    const { data: u } = await supabase
      .from('users')
      .select('id')
      .eq('blog_id', cookieUser.id)
      .maybeSingle();
    return u?.id ?? null;
  }

  return null;
}

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

    // Supabase Auth 우선, 실패 시 쿠키 세션(데모/블로거)으로 폴백
    const supabase = createServiceClient();
    const authUser = await getAuthUser(req).catch(() => null);
    const cookieUserId = authUser?.userId ? null : await resolveCookieUserId(supabase).catch(() => null);
    const trackedUserId = authUser?.userId ?? cookieUserId;

    // 관리자는 집계 제외 (본인 유입 자료 왜곡 방지)
    if (trackedUserId && isAdmin(trackedUserId)) {
      return NextResponse.json({ ok: true, skipped: 'admin' });
    }

    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = kst.toISOString().slice(0, 10);

    const isFirstVisit = body.first_visit === true;
    const deviceType = ['mobile', 'tablet', 'desktop'].includes(body.device_type)
      ? body.device_type
      : 'desktop';

    // 1) PV — 모든 페이지뷰마다 집계
    //    - users.total_visit_count (로그인 회원)
    //    - site_visits.pageview_count + 디바이스별 PV
    if (trackedUserId) {
      await supabase.rpc('increment_user_total_visit', { p_user_id: trackedUserId });
    }
    await supabase.rpc('increment_pageview', { p_date: today, p_device: deviceType });

    // 2) UV (순방문자) — 세션 첫 방문일 때만 site_visits.visit_count / 디바이스 UV 카운트
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

    // 3) visit_logs — 모든 페이지뷰 기록 (is_first_visit 플래그로 세션 첫 방문 구분)
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
      user_agent: ua.slice(0, 500) || null,
      user_id: trackedUserId || null,
      is_first_visit: isFirstVisit,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
