import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp } from '@/lib/rate-limit';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { isAdminAsync, isAdminFromProfile } from '@/lib/admin';

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

const OPTIONAL_VISIT_LOG_COLUMNS = ['demo_naver_id', 'is_first_visit', 'user_agent', 'user_id', 'country'] as const;

function getMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  const message = error.message || '';
  const quoted = message.match(/'([^']+)' column/)?.[1] || message.match(/column "([^"]+)"/)?.[1];
  if (quoted && OPTIONAL_VISIT_LOG_COLUMNS.includes(quoted as typeof OPTIONAL_VISIT_LOG_COLUMNS[number])) {
    return quoted;
  }
  return null;
}

/** localhost / 사설망 / mDNS 도메인 여부 (본인 dev 트래픽 허수 차단) */
function isLocalDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  if (d === 'localhost' || d === '127.0.0.1' || d === '0.0.0.0' || d === '::1') return true;
  if (/^10\./.test(d)) return true;
  if (/^192\.168\./.test(d)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(d)) return true;
  if (d.endsWith('.local')) return true;
  return false;
}

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

    // localhost / 사설망에서 보낸 요청(host 헤더 기준)도 dev 트래픽으로 판단
    const hostHeader = (req.headers.get('host') || '').split(':')[0];
    if (isLocalDomain(hostHeader)) {
      return NextResponse.json({ ok: true, skipped: 'local_host' });
    }

    // Supabase Auth 우선, 실패 시 쿠키 세션(데모/블로거)으로 폴백
    const supabase = createServiceClient();
    const authUser = await getAuthUser(req).catch(() => null);
    const cookieUserId = authUser?.userId ? null : await resolveCookieUserId(supabase).catch(() => null);
    const trackedUserId = authUser?.userId ?? cookieUserId;

    // 데모 체험자(쿠키 user_type=influencer) 식별 — users 매핑이 없는 케이스도 포함.
    // 유입분석에서 익명이 아니라 "데모 회원"으로 노출시키기 위해 쿠키의 naver_id 를 따로 저장.
    let demoNaverId: string | null = null;
    if (!trackedUserId) {
      const cookieUser = await getCookieUser().catch(() => null);
      if (cookieUser?.type === 'influencer') {
        demoNaverId = cookieUser.id;
      }
    }

    // 관리자는 집계 제외 (본인 유입 자료 왜곡 방지)
    // authUser 가 있으면 이미 로드된 is_admin 필드를 사용, 없으면(쿠키 세션) DB 조회로 확인.
    if (trackedUserId) {
      const trackedIsAdmin = authUser
        ? isAdminFromProfile({ id: trackedUserId, is_admin: authUser.user.is_admin })
        : await isAdminAsync(trackedUserId);
      if (trackedIsAdmin) {
        return NextResponse.json({ ok: true, skipped: 'admin' });
      }
    }

    const body = await req.json().catch(() => ({}));

    // referrer 가 localhost / 사설망 → 본인 dev 환경 트래픽으로 판단, 카운트·로그 모두 제외
    if (
      isLocalDomain(typeof body.referrer_domain === 'string' ? body.referrer_domain : null)
    ) {
      return NextResponse.json({ ok: true, skipped: 'local_referrer' });
    }

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = kst.toISOString().slice(0, 10);

    const isFirstVisit = body.first_visit === true;
    const deviceType = ['mobile', 'tablet', 'desktop'].includes(body.device_type)
      ? body.device_type
      : 'desktop';

    // 1) visit_logs — 모든 페이지뷰 기록 (is_first_visit 플래그로 세션 첫 방문 구분)
    //    운영 DB 스키마 캐시/마이그레이션 지연으로 선택 컬럼이 없을 때도 기본 로그는 남긴다.
    const pagePath = typeof body.path === 'string' ? body.path.slice(0, 500) : '/';
    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 1000) : '';
    const referrerDomain = typeof body.referrer_domain === 'string' ? body.referrer_domain.slice(0, 200) : null;
    const utmSource = typeof body.utm_source === 'string' ? body.utm_source.slice(0, 100) : null;
    const utmMedium = typeof body.utm_medium === 'string' ? body.utm_medium.slice(0, 100) : null;
    const utmCampaign = typeof body.utm_campaign === 'string' ? body.utm_campaign.slice(0, 200) : null;
    const country = req.headers.get('x-vercel-ip-country') || null;
    const visitLogPayload: Record<string, string | boolean | null> = {
      page_path: pagePath,
      referrer: referrer || null,
      referrer_domain: referrerDomain,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      device_type: deviceType,
      user_agent: ua.slice(0, 500) || null,
      user_id: trackedUserId || null,
      demo_naver_id: trackedUserId ? null : demoNaverId,
      is_first_visit: isFirstVisit,
      country,
    };

    let insertedId: number | null = null;
    for (let attempt = 0; attempt <= OPTIONAL_VISIT_LOG_COLUMNS.length; attempt += 1) {
      const { data: inserted, error: insertError } = await supabase
        .from('visit_logs')
        .insert(visitLogPayload)
        .select('id')
        .single();

      if (!insertError) {
        insertedId = typeof inserted?.id === 'number' ? inserted.id : null;
        break;
      }

      const missingColumn = getMissingColumn(insertError);
      if (!missingColumn || !(missingColumn in visitLogPayload)) {
        console.error('[analytics/track] visit_logs insert failed', insertError);
        return NextResponse.json({ ok: false, error: 'visit_log_insert_failed' }, { status: 500 });
      }

      console.warn('[analytics/track] retrying visit_logs insert without missing column', missingColumn);
      delete visitLogPayload[missingColumn];
    }

    // 2) 로그인 회원 집계 — DAU 방식 세션 + PV
    //    세션 RPC가 먼저 실행되어 옛 last_visited_at 을 읽고 오늘 KST 날짜와 비교,
    //    다른 날이면 total_session_count +1. 그 다음 PV RPC 가 last_visited_at을 NOW()로 갱신.
    if (trackedUserId) {
      await supabase.rpc('increment_user_session', { p_user_id: trackedUserId });
      await supabase.rpc('increment_user_total_visit', { p_user_id: trackedUserId });
    }

    // 3) 사이트 전체 PV — 모든 페이지뷰마다
    await supabase.rpc('increment_pageview', { p_date: today, p_device: deviceType });

    // 4) UV (순방문자) — 브라우저 세션 첫 방문일 때만 site_visits.visit_count / 디바이스 UV
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

    return NextResponse.json({ ok: true, id: insertedId });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
