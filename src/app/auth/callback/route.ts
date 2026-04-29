import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { registerSession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/my';

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
        // OAuth (Google 등) 신규 가입자 — users 테이블 레코드 자동 생성
        try {
          const admin = createServiceClient();
          const { data: existingUser } = await admin
            .from('users')
            .select('id')
            .eq('auth_id', user.id)
            .single();

          if (!existingUser) {
            const meta = (user.user_metadata || {}) as Record<string, unknown>;
            const rawName = (meta.full_name || meta.name || meta.user_name) as string | undefined;
            const emailPrefix = (user.email || '').split('@')[0] || 'user';
            let nickname = (rawName || emailPrefix).toString().trim().slice(0, 18) || 'user';

            // 닉네임 중복 시 _xxxx 4자리 suffix
            const { data: dup } = await admin
              .from('users')
              .select('id')
              .eq('nickname', nickname)
              .maybeSingle();
            if (dup) {
              const suffix = Math.floor(1000 + Math.random() * 9000);
              nickname = `${nickname.slice(0, 15)}_${suffix}`;
            }

            await admin.from('users').insert({
              auth_id: user.id,
              email: user.email,
              nickname,
            });
          }
        } catch (e) {
          console.error('[oauth-callback] user record bootstrap failed:', e);
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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 에러 시 로그인 페이지로 리다이렉트
  return NextResponse.redirect(`${origin}/auth/login?error=confirm_failed`);
}
