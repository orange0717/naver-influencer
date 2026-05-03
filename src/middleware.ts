import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';

// 동시 로그인 검증을 건너뛸 경로 (auth 흐름 + 정적/공개 API)
const SESSION_CHECK_BYPASS = [
  '/auth/',
  '/api/session/',
  '/api/auth/',
  '/_next/',
  '/favicon',
];

export async function middleware(request: NextRequest) {
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

  // device-id 쿠키가 없으면 자동 발급 (응답에 set)
  let deviceId = request.cookies.get(DEVICE_ID_COOKIE)?.value ?? null;
  const isNewDevice = !deviceId;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    supabaseResponse.cookies.set(DEVICE_ID_COOKIE, deviceId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  // 검증: 로그인됨 + 우회 경로 아님 + 기존 device (새로 발급한 첫 요청은 통과)
  if (user && !isBypass && !isNewDevice) {
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

  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "https://*.naver.com",
    "https://*.portone.io",
    "https://*.iamport.kr",
    "https://*.kpn.co.kr",
    "https://*.sentry.io",
  ];
  const frameSrc = [
    "'self'",
    "https://*.portone.io",
    "https://*.iamport.kr",
    "https://*.kpn.co.kr",
  ];
  if (isCapacitor) {
    connectSrc.push("capacitor://localhost", "https://localhost");
    frameSrc.push("capacitor://localhost", "https://localhost");
  }

  supabaseResponse.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.naver.com https://*.pstatic.net https://*.portone.io https://cdn.portone.io",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.naver.com https://*.pstatic.net",
      `connect-src ${connectSrc.join(' ')}`,
      `frame-src ${frameSrc.join(' ')}`,
    ].join('; '),
  );

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
