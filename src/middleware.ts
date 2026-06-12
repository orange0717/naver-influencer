import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';
import { isTrialExpired } from '@/lib/trial';
import { clearPostAuthDemoCookies } from '@/lib/demo-session';
import { isRestricted } from '@/lib/admin';

/**
 * 점검 모드: 켜면 모든 HTML 페이지 요청을 점검 안내 화면으로 즉시 응답한다.
 * Supabase 호출보다 앞단에서 끝나므로 백엔드 장애와 무관하게 빠르게 뜬다.
 * 복구 후 false 로 바꾸고 재배포하면 정상화.
 */
const MAINTENANCE_MODE = true;

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>시스템 점검 중 — N인플</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif;
    background: #FDF6F3;
    color: #4A3F3A;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #FFFFFF;
    border: 1px solid #F2E2DC;
    border-radius: 20px;
    padding: 48px 36px;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow: 0 8px 32px rgba(191, 135, 122, 0.12);
  }
  .icon { font-size: 48px; margin-bottom: 20px; }
  h1 { font-size: 22px; font-weight: 700; color: #BF877A; margin-bottom: 14px; }
  p { font-size: 15px; line-height: 1.7; color: #8C7A6E; }
  .sub { margin-top: 18px; font-size: 13px; color: #B5A69E; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🛠️</div>
    <h1>시스템 점검 중입니다</h1>
    <p>보다 안정적인 서비스 제공을 위해<br />시스템 점검을 진행하고 있습니다.<br />잠시 후 다시 이용해 주세요.</p>
    <p class="sub">이용에 불편을 드려 죄송합니다.</p>
  </div>
</body>
</html>`;

// 동시 로그인 검증을 건너뛸 경로 (auth 흐름 + 정적/공개 API)
const SESSION_CHECK_BYPASS = [
  '/auth/',
  '/api/session/',
  '/api/auth/',
  '/_next/',
  '/favicon',
];

const DEVICE_ID_BYPASS = [
  '/opengraph-image',
  '/robots.txt',
  '/sitemap.xml',
  '/sitemap-index.xml',
  '/sitemaps/',
  '/api/',
];

/** HTML 문서만: 커뮤니티는 비회원·비데모 접근 불가. 그 외 경로는 레이아웃/페이지에서 세부 제어 */
const AUTH_REQUIRED_PAGE_PREFIXES = ['/community'];

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Supabase 외부 호출이 hang/지연되어 Edge 미들웨어가 Vercel 제한시간(~25초)을
 * 넘기면 MIDDLEWARE_INVOCATION_TIMEOUT(504)로 사이트 전체가 죽는다. 각 호출을
 * 짧은 타임아웃으로 감싸 지연 시 안전한 fallback 으로 즉시 진행시켜, 일시적
 * Supabase 지연이 전체 장애로 번지지 않게 한다.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function middleware(request: NextRequest) {
  // Vercel 기본 도메인 차단 — ninfle.kr 외 vercel.app 호스트는 404 응답
  const host = request.headers.get('host') || '';
  if (host.endsWith('.vercel.app')) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // 점검 모드: HTML 페이지 탐색은 모두 점검 안내로 응답 (백엔드 호출 이전에 종료)
  if (MAINTENANCE_MODE) {
    const acceptsHtmlEarly = request.headers.get('accept')?.includes('text/html') ?? false;
    if (acceptsHtmlEarly && !request.nextUrl.pathname.startsWith('/_next/')) {
      return new NextResponse(MAINTENANCE_HTML, {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, must-revalidate',
          'Retry-After': '3600',
        },
      });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // 세션 토큰 갱신 + 사용자 조회 (지연 시 비로그인으로 폴백 — 미들웨어 hang 방지)
  const user = await withTimeout(
    supabase.auth.getUser().then((r) => r.data.user),
    8000,
    null,
  );

  // 동시 로그인 기기 제한 검증 (전 플랜 1대 공통)
  const pathname = request.nextUrl.pathname;
  const isBypass = SESSION_CHECK_BYPASS.some(p => pathname.startsWith(p));
  const acceptsHtml = request.headers.get('accept')?.includes('text/html') ?? false;
  const shouldIssueDeviceId = acceptsHtml && !DEVICE_ID_BYPASS.some(p => pathname.startsWith(p));
  const hasDemoSession =
    request.cookies.get('demo_mode')?.value === 'true' &&
    !!request.cookies.get('naver_id')?.value;
  const hasDemoParam = pathname === '/my' && !!request.nextUrl.searchParams.get('demo');

  const needsLoginPage =
    acceptsHtml &&
    AUTH_REQUIRED_PAGE_PREFIXES.some(p => matchesPathPrefix(pathname, p));

  if (needsLoginPage && !user && !hasDemoSession && !hasDemoParam) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.search = `?redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 공지사항: 정식 Supabase 로그인만 허용 (비회원·데모 쿠키만 있는 경우 차단)
  const needsNoticeLogin = acceptsHtml && matchesPathPrefix(pathname, '/notice');
  if (needsNoticeLogin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.search = `?redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 키워드 분석 UI·데이터: 정식 로그인 또는 데모 체험 쿠키 (완전 비회원 공개 아님)
  const needsKeywordsLogin =
    acceptsHtml && matchesPathPrefix(pathname, '/keywords');
  if (needsKeywordsLogin && !user && !hasDemoSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.search = `?redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  const isKeywordsApi =
    pathname === '/api/keywords' ||
    pathname.startsWith('/api/keywords/') ||
    pathname === '/api/downloads/keywords';
  if (isKeywordsApi && !user && !hasDemoSession) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 데모 체험( trial_started + 72h ) 만료 후: 로그인 없이 데모 쿠키만 있으면 유료 전환 유도
  // — /subscribe 는 허용(결제·안내). 커뮤니티(로그인 게이트) 또는 홈(/) 은 /subscribe 로 보냄.
  if (acceptsHtml && !user && hasDemoSession) {
    const trialStarted = request.cookies.get('trial_started')?.value;
    if (isTrialExpired(trialStarted)) {
      const onSubscribe = pathname === '/subscribe' || pathname.startsWith('/subscribe/');
      if (!onSubscribe) {
        const blockedByLoginGate = needsLoginPage || pathname === '/';
        if (blockedByLoginGate) {
          const url = request.nextUrl.clone();
          url.pathname = '/subscribe';
          url.search = '';
          return NextResponse.redirect(url);
        }
      }
    }
  }

  // device-id 쿠키가 없으면 HTML 페이지 요청에서만 자동 발급 (응답에 set)
  let deviceId = request.cookies.get(DEVICE_ID_COOKIE)?.value ?? null;
  const isNewDevice = !deviceId;
  if (!deviceId && shouldIssueDeviceId) {
    deviceId = crypto.randomUUID();
    supabaseResponse.cookies.set(DEVICE_ID_COOKIE, deviceId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  // 검증: 로그인됨 + 우회 경로 아님 + 기존 device (새로 발급한 첫 요청은 통과)
  if (user && deviceId && !isBypass && !isNewDevice) {
    // 지연 시 true 폴백 — 세션 유효 취급하여 통과(강제 로그아웃 안 함). 가용성 우선.
    const ok = await withTimeout(verifySession(user.id, deviceId), 4000, true);
    if (!ok) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.search = '?reason=session_taken';
      return NextResponse.redirect(url);
    }
  }

  // Capacitor WebView 감지
  const userAgent = request.headers.get('user-agent') || '';
  const isCapacitor = userAgent.includes('Capacitor');

  // 보안 헤더
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('X-Frame-Options', isCapacitor ? 'SAMEORIGIN' : 'DENY');
  supabaseResponse.headers.set('X-XSS-Protection', '1; mode=block');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  supabaseResponse.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://cdn.portone.io",
    "https://*.portone.io",
    "https://*.iamport.kr",
    "https://*.iamport.co",
    "https://*.kpn.co.kr",
  ];
  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
  ];
  const fontSrc = [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
  ];
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://*.naver.com",
    "https://*.pstatic.net",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
  ];
  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "https://*.naver.com",
    "https://*.portone.io",
    "https://*.iamport.kr",
    "https://*.iamport.co",
    "https://*.kpn.co.kr",
    "https://*.sentry.io",
    "https://www.google-analytics.com",
    "https://www.googletagmanager.com",
    "wss://*.supabase.co",
  ];
  const frameSrc = [
    "'self'",
    "https://*.portone.io",
    "https://*.iamport.kr",
    "https://*.iamport.co",
    "https://*.kpn.co.kr",
  ];
  if (isCapacitor) {
    connectSrc.push("capacitor://localhost", "https://localhost");
    frameSrc.push("capacitor://localhost", "https://localhost");
  }

  // HTML 문서(브라우저 탐색)는 중간 캐시로 오래된 레이아웃/헤더가 남는 경우가 있어 재검증 유도
  if (acceptsHtml && !pathname.startsWith('/api/')) {
    const isCompetitorPage = pathname === '/competitor';
    supabaseResponse.headers.set(
      'Cache-Control',
      isCompetitorPage
        ? 'private, no-store, max-age=0, must-revalidate'
        : 'private, max-age=0, must-revalidate',
    );
  }

  supabaseResponse.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src ${scriptSrc.join(' ')}`,
      `style-src ${styleSrc.join(' ')}`,
      `font-src ${fontSrc.join(' ')}`,
      `img-src ${imgSrc.join(' ')}`,
      `connect-src ${connectSrc.join(' ')}`,
      `frame-src ${frameSrc.join(' ')}`,
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  );

  // 제한된 사용자: 홈(/) + 프로필(/profile) 외 페이지는 모두 홈으로 리다이렉트.
  // 허용 경로 매칭을 먼저 수행해, 허용 경로일 땐 DB 비용(isRestricted = users + restricted_users 2회 SELECT)을 피한다.
  // 로그아웃은 /api/auth/logout POST 라 acceptsHtml 가드로 자연히 통과.
  if (user && user.email && acceptsHtml) {
    const allowedForRestricted =
      pathname === '/' || matchesPathPrefix(pathname, '/profile');
    // 지연 시 false 폴백 — 제한 없음 취급하여 통과. 유료 페이지·API 는 자체 가드 보유.
    if (!allowedForRestricted && (await withTimeout(isRestricted(user.email), 4000, false))) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // 정식 Supabase 세션이 있으면 데모 체험 쿠키는 무시·삭제 (가입 후 플랜 판정이 데모와 섞이지 않도록)
  if (user) {
    const hasDemoTrialCookies =
      request.cookies.get('demo_mode')?.value === 'true' ||
      !!request.cookies.get('trial_started')?.value;
    if (hasDemoTrialCookies) {
      clearPostAuthDemoCookies(supabaseResponse);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
