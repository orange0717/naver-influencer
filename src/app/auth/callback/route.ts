import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { registerSession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';
import { createServiceClient } from '@/lib/supabase-server';
import { clearPostAuthDemoCookies } from '@/lib/demo-session';

// next 파라미터를 같은 origin 의 내부 경로로만 허용 (open redirect 방지).
// '//evil.com', '/\\evil.com', 외부 절대 URL 등은 모두 기본값으로 폴백.
function sanitizeNext(raw: string | null): string {
  const fallback = '/my';
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 동시 로그인 기기 제한 — 세션 등록 (device_id 쿠키 없으면 신규 발급)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // 정책: 구글 로그인은 최초 1회에 한해 그 자리에서 신규 가입을 허용한다.
        //   public.users 레코드가 없으면 = 최초 Google 로그인이므로 세션은
        //   유지한 채 온보딩 페이지로 보내 닉네임/약관 동의(+선택적 블로그
        //   연결)를 완료시킨다. 온보딩 미완료 상태는 /api/auth/me 가 그대로
        //   비로그인처럼 취급하므로 별도 미들웨어 처리가 필요 없다.
        const admin = createServiceClient();
        // auth_id(비밀번호 로그인) 또는 google_auth_id(자동매칭으로 연결된 계정)
        // 둘 중 하나만 맞아도 기존 회원 — 안 그러면 매칭된 회원이 Google
        // 재로그인할 때마다 온보딩 루프에 빠진다.
        const { data: existingUser } = await admin
          .from('users')
          .select('id')
          .or(`auth_id.eq.${user.id},google_auth_id.eq.${user.id}`)
          .maybeSingle();

        let deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
        if (!deviceId) {
          deviceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36);
          cookieStore.set(DEVICE_ID_COOKIE, deviceId, {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax',
            secure: origin.startsWith('https://'),
          });
        }
        const userAgent = request.headers.get('user-agent') ?? null;
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? request.headers.get('x-real-ip')
          ?? null;
        await registerSession(user.id, deviceId, { userAgent, ip });

        if (!existingUser) {
          const res = NextResponse.redirect(`${origin}/auth/onboard?next=${encodeURIComponent(next)}`);
          clearPostAuthDemoCookies(res);
          return res;
        }
      }
      const res = NextResponse.redirect(`${origin}${next}`);
      clearPostAuthDemoCookies(res);
      return res;
    }
  }

  // 에러 시 메인페이지 로그인 모달로 리다이렉트
  return NextResponse.redirect(`${origin}/?authModal=login&error=confirm_failed`);
}
