import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';
import { isTrialExpired } from '@/lib/trial';
import { clearPostAuthDemoCookies } from '@/lib/demo-session';
import { isRestricted } from '@/lib/admin';
import { defaultApiLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getAllAuthOnlyHrefs } from '@/lib/sidebar-nav';

/**
 * 점검 모드: 켜면 모든 HTML 페이지 요청을 점검 안내 화면으로 즉시 응답한다.
 * Supabase 호출보다 앞단에서 끝나므로 백엔드 장애와 무관하게 빠르게 뜬다.
 * 복구 후 false 로 바꾸고 재배포하면 정상화.
 */
const MAINTENANCE_MODE = false;

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

// 서버 간 인증 트래픽(크론 시크릿·웹훅 서명 검증)은 IP 기반 전역 제한에서 제외
const DEFAULT_RATE_LIMIT_BYPASS = ['/api/cron/', '/api/portone/'];

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

/**
 * 좌측 사이드바 "회원 전용" 메뉴 — 비회원(정식 로그인·데모 모두 아님)이 URL 직접 입력·새 탭·
 * 북마크로 접근해도 사이드바 클릭 차단과 동일하게 막는다 (Route Guard).
 * /keywords, /community, /notice 는 위 다른 규칙에서 이미 커버되므로 중복 포함하지 않는다.
 * /influencers/[id] 상세 페이지는 OG 공유용 공개 페이지라 제외 — /influencers(목록)와
 * /influencers/free-plan(무료 명단)만 별도로 처리한다.
 */
const MEMBER_ONLY_GATE_PREFIXES = [
  '/rankings/influencer',
  '/rankings/official',
  '/influencers/free-plan',
  '/naver-mate-ranking',
  '/my/naver-mate',
  '/my/fans',
  '/my/keyword-ranking',
  '/my/blogger',
  '/my/saved-keywords',
  '/profile',
  '/decoder',
  '/competitor',
  '/image-converter',
];

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * sidebar-nav.ts에서 authOnly로 선언됐지만 MEMBER_ONLY_GATE_PREFIXES가 아닌
 * 다른 방식으로 이미 보호되고 있어 이 목록에 넣지 않는 경로 — 반드시 "왜"를 남길 것.
 * 아래 목록에도 MEMBER_ONLY_GATE_PREFIXES에도 없는 authOnly 경로는 실제로 새는 것이니
 * getAllAuthOnlyHrefs() 감사 로직이 잡아낸다.
 */
const GATE_HANDLED_ELSEWHERE = new Set([
  '/my', // 비로그인 시 리다이렉트 대신 GuestDashboard 빈 상태를 의도적으로 렌더 (src/app/my/page.tsx)
  '/notice', // needsNoticeLogin — 데모 세션도 차단하는 더 엄격한 별도 규칙 (아래)
  // AI 호출 비용 발생 기능 — 데모 세션도 명시적으로 제외해야 해서 페이지 자체 서버 체크로 처리
  '/dashboard/writing/spellcheck',
  '/dashboard/writing/rewrite',
  '/dashboard/youtube-stt',
  '/dashboard/claude', // requireInfluencerPlusPage (src/lib/plan-server-guards.ts)
]);

function isAuthOnlyHrefAccounted(href: string): boolean {
  if (GATE_HANDLED_ELSEWHERE.has(href)) return true;
  if (href === '/influencers') return true; // 아래 needsMemberOnlyGate에서 exact match로 별도 처리
  return MEMBER_ONLY_GATE_PREFIXES.some(p => matchesPathPrefix(href, p));
}

// 모듈 로드 시 1회만 실행 — sidebar-nav.ts와 middleware.ts가 어긋나면 즉시 로그로 드러낸다.
// (2026-07-21: /naver-mate-ranking, /my/blogger, /my/saved-keywords, /profile 4곳이
//  authOnly로 선언만 되고 실제 차단은 어디에도 없어 비회원에게 그대로 노출됐던 사고 재발 방지용)
const unaccountedAuthOnlyHrefs = getAllAuthOnlyHrefs().filter(href => !isAuthOnlyHrefAccounted(href));
if (unaccountedAuthOnlyHrefs.length > 0) {
  console.warn(
    `[member-gate-audit] sidebar-nav.ts에 authOnly로 선언됐지만 middleware.ts 어디에도 실제 차단이 없는 경로: ${unaccountedAuthOnlyHrefs.join(', ')} — MEMBER_ONLY_GATE_PREFIXES 또는 GATE_HANDLED_ELSEWHERE에 등록 필요`,
  );
}

/**
 * 페이지 하나가 마운트될 때 /api/auth/me, /api/notifications, /api/messages 등
 * 5~8개 요청이 동시에 이 미들웨어를 거치며 각자 supabase.auth.getUser()를 호출한다.
 * 액세스 토큰이 만료 시점 근처면 이 병렬 호출들이 동시에 같은 refresh_token 갱신을
 * 시도하고, Supabase가 나머지를 "Too many concurrent token refresh requests" 409로
 * 거부하면서 해당 Edge 함수 invocation 자체가 죽는다 (2026-07-17 프로덕션 로그로 확인,
 * /my/naver-mate 등에서 "내 대시보드를 불러오지 못했습니다" 오류의 실제 원인).
 * 같은 순간 도착한 요청들이 쿠키(세션)가 같으면 getUser() 호출 자체를 공유해
 * Supabase로 나가는 동시 갱신 요청 수를 줄인다 — warm 인스턴스 내에서만 유효하지만
 * 새 인프라 없이 근본 원인(동시 갱신 폭주)을 줄이는 가장 직접적인 조치.
 */
const inFlightUserChecks = new Map<string, Promise<{ id: string; email?: string | null } | null>>();

function getUserDeduped(
  supabase: ReturnType<typeof createServerClient>,
  cookieHeader: string,
): Promise<{ id: string; email?: string | null } | null> {
  const existing = inFlightUserChecks.get(cookieHeader);
  if (existing) return existing;

  const promise = supabase.auth.getUser()
    .then((r: Awaited<ReturnType<typeof supabase.auth.getUser>>) => r.data.user)
    .catch(() => null);

  inFlightUserChecks.set(cookieHeader, promise);
  promise.finally(() => {
    // 같은 배치에 도착한 요청들끼리만 공유하고 곧바로 비워, 이후 요청은 최신 세션을 다시 확인한다.
    if (inFlightUserChecks.get(cookieHeader) === promise) {
      inFlightUserChecks.delete(cookieHeader);
    }
  });

  return promise;
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
  // /api/cron/*은 예외: Vercel Cron 스케줄러는 배포 전용 *.vercel.app URL로만 호출 가능하므로
  // (커스텀 도메인 지정 불가) 여기서 막으면 크론이 영구히 실행되지 않는다 (2026-07-13 확인).
  const host = request.headers.get('host') || '';
  if (host.endsWith('.vercel.app') && !request.nextUrl.pathname.startsWith('/api/cron/')) {
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

  // 전역 API Rate Limit 안전망 — 라우트 자체 limiter 유무와 무관하게 IP당 기본 상한 적용
  const earlyPathname = request.nextUrl.pathname;
  if (
    earlyPathname.startsWith('/api/') &&
    !DEFAULT_RATE_LIMIT_BYPASS.some(p => earlyPathname.startsWith(p))
  ) {
    const ip = getClientIp(request);
    if (await defaultApiLimiter.check(`default:${ip}`)) {
      return rateLimitResponse();
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

  // 세션 토큰 갱신 + 사용자 조회 (지연/동시 갱신 충돌 시 비로그인으로 폴백 — 미들웨어 hang·crash 방지)
  const user = await withTimeout(
    getUserDeduped(supabase, request.headers.get('cookie') || ''),
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
    url.pathname = '/';
    url.search = `?authModal=login&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 공지사항: 정식 Supabase 로그인만 허용 (비회원·데모 쿠키만 있는 경우 차단)
  const needsNoticeLogin = acceptsHtml && matchesPathPrefix(pathname, '/notice');
  if (needsNoticeLogin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?authModal=login&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 키워드 분석 UI·데이터: 정식 로그인 또는 데모 체험 쿠키 (완전 비회원 공개 아님)
  // 단, /keywords/blogger·/keywords/blog-ranking은 완전 공개 마케팅/SEO 페이지라 예외
  // (각자 generateMetadata까지 갖춰져 있었는데 이 게이트에 막혀 크롤러가 도달 못 하고 있었음)
  const PUBLIC_KEYWORDS_PATHS = ['/keywords/blogger', '/keywords/blog-ranking'];
  const needsKeywordsLogin =
    acceptsHtml &&
    matchesPathPrefix(pathname, '/keywords') &&
    !PUBLIC_KEYWORDS_PATHS.some(p => matchesPathPrefix(pathname, p));
  if (needsKeywordsLogin && !user && !hasDemoSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?authModal=login&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 사이드바 "회원 전용" 메뉴 — 비회원의 URL 직접 접근을 사이드바 클릭 차단과 동일하게 막고,
  // 홈에서 회원 전용 모달(데모 체험/로그인 선택지)을 띄운다.
  const needsMemberOnlyGate =
    acceptsHtml &&
    (pathname === '/influencers' ||
      MEMBER_ONLY_GATE_PREFIXES.some(p => matchesPathPrefix(pathname, p)));
  if (needsMemberOnlyGate && !user && !hasDemoSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?memberOnly=1&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  const isKeywordsApi =
    pathname === '/api/keywords' ||
    pathname.startsWith('/api/keywords/') ||
    pathname === '/api/downloads/keywords';
  if (isKeywordsApi && !user && !hasDemoSession) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 인플루언서 순위/키챌 데이터 API: 로그인 또는 데모 세션 필요
  // - /api/influencers/recent (인트로 공개용), /api/influencers/list, /api/influencers/free-plan
  //   (무료 명단, 자체 로그인 체크)는 제외
  const isInfluencersRankingApi =
    (pathname === '/api/influencers' || pathname.startsWith('/api/influencers/')) &&
    pathname !== '/api/influencers/recent' &&
    !pathname.startsWith('/api/influencers/list') &&
    !pathname.startsWith('/api/influencers/free-plan');
  if (isInfluencersRankingApi && !user && !hasDemoSession) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 네이버메이트 랭킹 API: 회원 전용 페이지(/naver-mate-ranking)와 동일하게 보호
  const isNaverMateRankingApi = pathname.startsWith('/api/rankings/naver-mate');
  if (isNaverMateRankingApi && !user && !hasDemoSession) {
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
      url.pathname = '/';
      url.search = '?authModal=login&reason=session_taken';
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
