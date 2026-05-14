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
        // 정책: 구글 등 OAuth 는 "이미 회원가입한 계정만" 로그인 허용.
        //   public.users 레코드가 없으면 = 신규 OAuth 가입 시도이므로
        //   세션을 폐기하고 로그인 페이지로 안내한다. auth.users 레코드도
        //   삭제해 같은 이메일로 추후 정상 가입할 수 있게 한다.
        const admin = createServiceClient();
        const { data: existingUser } = await admin
          .from('users')
          .select('id')
          .eq('auth_id', user.id)
          .maybeSingle();

        if (!existingUser) {
          await supabase.auth.signOut();
          try {
            await admin.auth.admin.deleteUser(user.id);
          } catch (e) {
            console.error('[oauth-callback] cleanup deleteUser failed:', e);
          }
          return NextResponse.redirect(`${origin}/auth/login?reason=oauth_no_account`);
        }

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
      }
      const res = NextResponse.redirect(`${origin}${next}`);
      clearPostAuthDemoCookies(res);
      return res;
    }
  }

  // 에러 시 로그인 페이지로 리다이렉트
  return NextResponse.redirect(`${origin}/auth/login?error=confirm_failed`);
}
