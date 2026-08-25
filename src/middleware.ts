import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';
import { isRestricted, getPaywallContext } from '@/lib/admin';
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
  '/influencers/free-plan',
  '/naver-mate-ranking',
  '/my/naver-mate',
  '/my/fans',
  '/my/keyword-ranking',
  '/my/missing-posts',
  '/my/blogger',
  '/my/saved-keywords',
  '/profile',
  '/decoder',
  '/competitor',
  '/image-converter',
  '/image-editor',
];

/**
 * 키워드 챌린지 리스트/추천/대량조회는 완전 공개 마케팅/SEO 페이지 2개(블로그 검색·블로그 순위)만 예외.
 * 모듈 스코프로 둬서 isAuthOnlyHrefAccounted(감사 로직)와 middleware() 본문이 같은 상수를 공유한다.
 */
const PUBLIC_KEYWORDS_PATHS = ['/keywords/blogger', '/keywords/blog-ranking'];

/**
 * PRO 이용권 없이는 접근 불가한 페이지(대량 조회·헤비 AI 등 비용이 큰 기능) — 로그인은 되어 있으나
 * 활성 PRO 이용권이 없는 회원을 /subscribe?needsPro=1 로 보낸다.
 * 로그인 자체가 안 된 사용자는 MEMBER_ONLY_GATE_PREFIXES 등 기존 게이트가 먼저 처리한다.
 */
// 2026-08-13: 무료 하루 3회 정책 적용 화면(키워드/순위/유입 분석)은 이 하드 유료 게이트에서 제외하고,
// 각 화면의 주요 데이터 API에서 withAnalysisView 로 "무료 3회" 를 서버 강제한다.
// (/rankings/blogger, /naver-mate-ranking 은 제거, /my/post-analysis 는 아래 EXEMPT 로 예외)
const PAID_PLAN_GATE_PREFIXES = [
  '/my',
  '/rankings/influencer',
  '/keywords/bulk',
  '/keywords/recommend',
  '/competitor',
];
// /my 하위이지만 유료 게이트에서 예외인 경로:
//  - 계정 연결(link)은 결제 무관하게 열어둠
//  - /my/post-analysis(유입 분석)는 무료 하루 3회 정책 대상 → 페이지 접근 허용(데이터는 서버가 3회로 캡)
const PAID_PLAN_GATE_EXEMPT = ['/my/link', '/my/link-blog', '/my/post-analysis', '/my/missing-posts', '/my/keyword-ranking'];

const PAID_PLAN_GATE_API_PREFIXES = ['/api/my'];
// /api/my 하위이지만 유료 게이트에서 예외인 경로:
//  - 계정 연결(link)은 결제 무관하게 열어둠
//  - 대표키워드 일괄 추출은 무료 화면(/my/keyword-ranking, PAID_PLAN_GATE_EXEMPT)의 주 버튼이다.
//    포스팅당 1회씩 부르던 무료 경로(/api/blog/representative-keywords)를 묶기만 한 것이라
//    (제목 규칙 전용·네이버/AI 무호출) 유료 게이트를 걸면 무료 회원의 기존 동작이 402로 깨진다.
//    본인 블로그 여부는 라우트의 assertBlogResourceAccess 가 그대로 강제한다.
const PAID_PLAN_GATE_API_EXEMPT = [
  '/api/my/link',
  '/api/my/link-blog',
  '/api/my/representative-keywords/extract',
];

// 2026-08-13 무료 하루 3회 정책: 전용 분석 화면(/my/missing-posts, /my/keyword-ranking)이
// 마운트 시 조회하는 /api/my 데이터. GET + X-View-Token 헤더가 있으면 유료 하드 게이트를 건너뛰고,
// 라우트의 withAnalysisView(requireToken)가 "무료 3회"를 서버 강제한다. (토큰 없는 대시보드/북마크
// 호출과 GET 외 메서드(저장 등)는 기존대로 유료 게이트 유지 — 토큰 스푸핑으로 결제 우회 불가.)
const VIEW_TOKEN_GATED_API_PREFIXES = [
  '/api/my/post-missing-state',
  '/api/my/post-missing-history',
  '/api/my/keyword-ranking-state',
  '/api/my/representative-keywords-state',
];

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * @supabase/ssr 세션 쿠키(sb-<ref>-auth-token, 청크 시 .0/.1 …) 존재 여부.
 * "한 번이라도 로그인해 세션 쿠키를 들고 있는 사용자"와 "세션 쿠키가 아예 없는
 * 순수 비회원"을 구분하는 신호로 쓴다. code-verifier(OAuth 진행 중)는 제외한다.
 */
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
}

/**
 * sidebar-nav.ts에서 authOnly로 선언됐지만 MEMBER_ONLY_GATE_PREFIXES가 아닌
 * 다른 방식으로 이미 보호되고 있어 이 목록에 넣지 않는 경로 — 반드시 "왜"를 남길 것.
 * 아래 목록에도 MEMBER_ONLY_GATE_PREFIXES에도 없는 authOnly 경로는 실제로 새는 것이니
 * getAllAuthOnlyHrefs() 감사 로직이 잡아낸다.
 */
const GATE_HANDLED_ELSEWHERE = new Set([
  '/my', // 비로그인 시 리다이렉트 대신 GuestDashboard 빈 상태를 의도적으로 렌더 (src/app/my/page.tsx)
  // AI 호출 비용 발생 기능 — 데모 세션도 명시적으로 제외해야 해서 페이지 자체 서버 체크로 처리
  '/dashboard/writing/spellcheck',
  '/dashboard/writing/rewrite',
  '/dashboard/writing/content-angles',
  '/dashboard/writing/titles',
  '/dashboard/writing/body',
  '/dashboard/youtube-stt',
  '/dashboard/claude', // requireInfluencerPlusPage (src/lib/plan-server-guards.ts)
  '/topics', // requireInfluencerPlusPage (src/lib/plan-server-guards.ts) — AI 토픽 큐레이션, dashboard/claude와 동일 패턴
  '/dashboard/google-indexing', // page.tsx 자체에서 getPaywallContext로 미인증/미결제 redirect 처리
  '/dashboard/content/youtube', // page.tsx 자체 서버 체크(getUserWithTimeout + INFLUENCER 플랜) — AI 호출 비용 발생 기능
  '/dashboard/content/shortform', // page.tsx 자체 서버 체크(getUserWithTimeout + INFLUENCER 플랜) — Manus+AI 호출 비용 발생 기능
  '/dashboard', // page.tsx 자체에서 getUserWithTimeout + 데모쿠키 체크 후 비로그인은 /로 redirect (구 홈 KPI 대시보드가 이동해온 자리)
]);

function isAuthOnlyHrefAccounted(href: string): boolean {
  if (GATE_HANDLED_ELSEWHERE.has(href)) return true;
  if (href === '/influencers') return true; // 아래 needsMemberOnlyGate에서 exact match로 별도 처리
  if (
    matchesPathPrefix(href, '/keywords') &&
    !PUBLIC_KEYWORDS_PATHS.some(p => matchesPathPrefix(href, p))
  ) {
    return true; // 아래 needsKeywordsLogin에서 prefix 매칭으로 별도 처리
  }
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

  // 세션 토큰 갱신 + 사용자 조회 (지연/동시 갱신 충돌 시 미들웨어 hang·crash 방지를 위해 null 폴백)
  const user = await withTimeout(
    getUserDeduped(supabase, request.headers.get('cookie') || ''),
    8000,
    null,
  );

  // "확정 비회원" vs "인증 불확정" 구분.
  // user 가 null 인 이유는 두 가지다:
  //   (1) 세션 쿠키 자체가 없음 → 진짜 비회원 → 게이트/리다이렉트가 맞다.
  //   (2) 세션 쿠키는 있으나 getUser 가 지연·동시 갱신 충돌(429/409)·일시 오류로 실패 →
  //       실제로는 로그인 사용자일 가능성이 높다. 이때 로그인/회원가입 화면으로 되돌리면
  //       "로그인했는데 다시 회원가입 화면" 버그가 된다. → 페이지 리다이렉트를 건너뛰고
  //       통과시켜(가용성 우선) 클라이언트 useAuth 가 세션을 재확인하도록 한다.
  //       (데이터 API 는 여전히 401 로 보호되므로 유료/회원 데이터가 새지 않는다.)
  const authIndeterminate = !user && hasSupabaseAuthCookie(request);

  // 동시 로그인 기기 제한 검증 (전 플랜 1대 공통)
  const pathname = request.nextUrl.pathname;
  const isBypass = SESSION_CHECK_BYPASS.some(p => pathname.startsWith(p));
  const acceptsHtml = request.headers.get('accept')?.includes('text/html') ?? false;
  const shouldIssueDeviceId = acceptsHtml && !DEVICE_ID_BYPASS.some(p => pathname.startsWith(p));

  const needsLoginPage =
    acceptsHtml &&
    AUTH_REQUIRED_PAGE_PREFIXES.some(p => matchesPathPrefix(pathname, p));

  if (needsLoginPage && !user && !authIndeterminate) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?authModal=login&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 키워드 분석 UI·데이터: 정식 로그인 필요 (완전 비회원 공개 아님)
  // 단, /keywords/blogger·/keywords/blog-ranking은 완전 공개 마케팅/SEO 페이지라 예외
  // (각자 generateMetadata까지 갖춰져 있었는데 이 게이트에 막혀 크롤러가 도달 못 하고 있었음)
  const needsKeywordsLogin =
    acceptsHtml &&
    matchesPathPrefix(pathname, '/keywords') &&
    !PUBLIC_KEYWORDS_PATHS.some(p => matchesPathPrefix(pathname, p));
  if (needsKeywordsLogin && !user && !authIndeterminate) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?memberOnly=1&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // 사이드바 "회원 전용" 메뉴 — 비회원의 URL 직접 접근을 사이드바 클릭 차단과 동일하게 막고,
  // 홈에서 회원 전용 모달(회원가입/로그인 선택지)을 띄운다.
  const needsMemberOnlyGate =
    acceptsHtml &&
    (pathname === '/influencers' ||
      MEMBER_ONLY_GATE_PREFIXES.some(p => matchesPathPrefix(pathname, p)));
  if (needsMemberOnlyGate && !user && !authIndeterminate) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?memberOnly=1&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  // PRO 이용권 없음 → /subscribe 로 안내 (로그인은 되어 있는 경우만 대상).
  // 2026-08-08 프리미엄 모델 전환: 자가발급 7일 체험 폐지 — 이 경로는 원래부터
  // "비싸서 무료 없음" 기능(대량 조회·헤비 AI 등)만 모아둔 것이므로 이용권 구매 안내만 한다.
  const needsPaidPlanGate =
    acceptsHtml &&
    PAID_PLAN_GATE_PREFIXES.some(p => matchesPathPrefix(pathname, p)) &&
    !PAID_PLAN_GATE_EXEMPT.some(p => matchesPathPrefix(pathname, p));
  if (needsPaidPlanGate && user) {
    // 지연 시 유료 플랜 보유로 폴백 — 가용성 우선(기존 isRestricted/verifySession과 동일 철학).
    const ctx = await withTimeout(
      getPaywallContext(user.id, user.email),
      4000,
      { isAdminUser: false, hasActivePaidPlan: true, plan: null, expiresAt: null, userId: null },
    );
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      const url = request.nextUrl.clone();
      url.pathname = '/subscribe';
      url.search = `?needsPro=1&redirect=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
      return NextResponse.redirect(url);
    }
  }

  const isKeywordsApi =
    pathname === '/api/keywords' ||
    pathname.startsWith('/api/keywords/') ||
    pathname === '/api/downloads/keywords';
  if (isKeywordsApi && !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 인플루언서 순위/키챌 데이터 API: 로그인 필요
  // - /api/influencers/recent (인트로 공개용), /api/influencers/list, /api/influencers/free-plan
  //   (무료 명단, 자체 로그인 체크)는 제외
  const isInfluencersRankingApi =
    (pathname === '/api/influencers' || pathname.startsWith('/api/influencers/')) &&
    pathname !== '/api/influencers/recent' &&
    !pathname.startsWith('/api/influencers/list') &&
    !pathname.startsWith('/api/influencers/free-plan');
  if (isInfluencersRankingApi && !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 유료 리스트 API(/api/influencers, 팬수·챌린지·TOP3·순위 전체)는 유료 인플루언서 플랜 전용.
  // 페이지(/influencers)는 requireInfluencerPlusPage로 이미 막지만, 원본 데이터 API가 로그인만
  // 하면 열려 있어 무료 회원이 직접 호출해 전체 유료 데이터를 긁어갈 수 있었다(2026-08-13 차단).
  // - 계정 연결 검색은 별도 경량 엔드포인트(/api/influencers/search)로 분리돼 영향 없음.
  // - 상세(/api/influencers/[id] 등)는 공개 OG 페이지용이라 exact match로만 스코프한다.
  if (pathname === '/api/influencers' && user) {
    const ctx = await withTimeout(
      getPaywallContext(user.id, user.email),
      4000,
      { isAdminUser: false, hasActivePaidPlan: true, plan: null, expiresAt: null, userId: null },
    );
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      return NextResponse.json({ error: '유료 플랜이 필요합니다.', requiresPlan: 'influencer' }, { status: 402 });
    }
  }

  // 네이버메이트 랭킹 API: 로그인만 필요(회원 전용). 무료회원 하루 3회 제한은
  // 라우트(/api/rankings/naver-mate)의 withAnalysisView 가 서버에서 강제한다(2026-08-13 무료 3회 정책).
  const isNaverMateRankingApi = pathname.startsWith('/api/rankings/naver-mate');
  if (isNaverMateRankingApi && !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // /my API 전반: 계정 연결(/api/my/link, /api/my/link-blog)은 결제 여부와 무관하게 열어둔다
  // 무료 3회 정책 대상 조회(GET + X-View-Token)는 유료 하드 게이트를 건너뛰고 라우트가 3회를 강제한다.
  const isViewTokenDeferredApi =
    request.method === 'GET' &&
    !!request.headers.get('x-view-token') &&
    VIEW_TOKEN_GATED_API_PREFIXES.some(p => matchesPathPrefix(pathname, p));
  const isPaidPlanGateApi =
    PAID_PLAN_GATE_API_PREFIXES.some(p => matchesPathPrefix(pathname, p)) &&
    !PAID_PLAN_GATE_API_EXEMPT.some(p => matchesPathPrefix(pathname, p)) &&
    !isViewTokenDeferredApi;
  if (isPaidPlanGateApi && user) {
    const ctx = await withTimeout(
      getPaywallContext(user.id, user.email),
      4000,
      { isAdminUser: false, hasActivePaidPlan: true, plan: null, expiresAt: null, userId: null },
    );
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      return NextResponse.json({ error: '유료 플랜이 필요합니다.', requiresPlan: 'blogger' }, { status: 402 });
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
      // API(fetch) 요청은 HTML 로그인 페이지로 302 리다이렉트하면 클라이언트가
      // res.json() 파싱에 실패하고 그 오류를 삼켜 "데이터 없음" 빈 상태로 오인한다.
      // → API 는 401 JSON 으로 응답해 클라이언트가 "재로그인 필요"를 정확히 표시하게 한다.
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'session_taken', reason: '다른 기기에서 로그인되어 세션이 종료되었습니다.' },
          { status: 401 },
        );
      }
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
    // Pretendard 웹폰트 CSS (본문·UI 산세리프). EB Garamond는 Google Fonts로 로드.
    "https://cdn.jsdelivr.net",
  ];
  const fontSrc = [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
    // Pretendard woff2 서브셋 파일 (dynamic-subset)
    "https://cdn.jsdelivr.net",
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
    // KPN 결제창의 실제 호스트는 kpn.co.kr 이 아니라 퍼스트페이(pg.firstpay.co.kr) 다.
    // 빠지면 결제창 iframe 이 frame-src 로 차단돼 회색 빈 화면만 뜬다.
    "https://*.firstpay.co.kr",
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

  // 이미지 편집기(/image-editor)의 AI 배경 제거는 브라우저에서 @imgly/background-removal이
  // WASM(ONNX)로 추론하고 모델 자산을 staticimgly.com CDN에서 받아온다. 전역 CSP는 그대로
  // 두고 이 경로에서만 eval(WASM 글루)·blob 워커·CDN fetch를 허용한다.
  const workerSrc = ["'self'"];
  if (matchesPathPrefix(pathname, '/image-editor')) {
    // onnxruntime-web은 WASM 로딩 글루에서 문자열을 eval하므로 'unsafe-eval'이 필요하다
    // (WASM만 허용하는 'wasm-unsafe-eval'로는 EvalError로 실패). 이 경로에서만 허용.
    scriptSrc.push("'unsafe-eval'", "blob:");
    connectSrc.push("https://staticimgly.com", "blob:");
    workerSrc.push("blob:");
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
      `worker-src ${workerSrc.join(' ')}`,
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

  // 폐지된 데모 체험 쿠키가 남아 있으면 정리 (플랜 판정이 옛 쿠키와 섞이지 않도록)
  if (
    request.cookies.get('demo_mode')?.value ||
    request.cookies.get('trial_started')?.value
  ) {
    supabaseResponse.cookies.delete('demo_mode');
    supabaseResponse.cookies.delete('trial_started');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
