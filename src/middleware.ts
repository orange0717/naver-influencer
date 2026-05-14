import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';
import { isTrialExpired } from '@/lib/trial';

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

const AUTH_REQUIRED_PAGE_PREFIXES = [
  '/my',
  '/keywords',
  '/influencers',
  '/competitor',
  '/community',
  '/rankings',
  '/notice',
  '/subscribe',
  '/messages',
  '/dashboard',
  '/profile',
  '/download',
];

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function middleware(request: NextRequest) {
  // Vercel 기본 도메인 차단 — ninfle.kr 외 vercel.app 호스트는 404 응답
  const host = request.headers.get('host') || '';
  if (host.endsWith('.vercel.app')) {
    return new NextResponse('Not Found', { status: 404 });
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

  // 세션 토큰 갱신 + 사용자 조회
  const { data: { user } } = await supabase.auth.getUser();

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

  if (needsLoginPage) {
    const isDownload = matchesPathPrefix(pathname, '/download');
    if (isDownload) {
      // 데스크탑 앱 다운로드: Supabase 회원만. 데모 쿠키(demo_mode)만으로는 접근 불가.
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/login';
        url.search = `?redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
        return NextResponse.redirect(url);
      }
    } else if (!user && !hasDemoSession && !hasDemoParam) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.search = `?redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
      return NextResponse.redirect(url);
    }
  }

  // 데모 체험( trial_started + 72h ) 만료 후: 로그인 없이 데모 쿠키만 있으면 유료 전환 유도
  // — /subscribe 는 허용(결제·안내). 그 외 보호 HTML 경로 + 홈(/) 은 /subscribe 로 보냄.
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
    const ok = await verifySession(user.id, deviceId);
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
