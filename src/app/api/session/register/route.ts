/**
 * POST /api/session/register
 * 로그인 직후 클라이언트가 호출 — 현재 device 를 user_sessions 에 등록
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { registerSession } from '@/lib/session-limit';
import { DEVICE_ID_COOKIE } from '@/lib/device-id';

export async function POST(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  if (!deviceId) return NextResponse.json({ ok: false, reason: 'no_device_id' }, { status: 400 });

  const userAgent = request.headers.get('user-agent') ?? null;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? null;

  const result = await registerSession(user.id, deviceId, { userAgent, ip });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
