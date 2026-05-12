import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { desktopTelemetryLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  event: z.enum(['download_page_view', 'asset_download_click', 'app_launch']),
  detail: z.string().max(120).optional().nullable(),
  clientId: z.string().max(80).optional().nullable(),
  appVersion: z.string().max(40).optional().nullable(),
});

/**
 * 데스크탑 앱 관련 비식별 이벤트 수집 (다운로드 페이지 방문, 에셋 클릭, 앱 실행).
 * 로그인 시 user_id 연결. download_* 이벤트는 로그인 필수, app_launch(Electron)만 비로그인 허용.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (await desktopTelemetryLimiter.check(`desktop_tel:${ip}`)) {
    return rateLimitResponse();
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const auth = await getAuthUser(req);
  if (parsed.data.event !== 'app_launch' && !auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const ua = req.headers.get('user-agent')?.slice(0, 500) || null;
  const userId = auth?.userId ?? null;

  const supabase = createServiceClient();
  const { error } = await supabase.from('desktop_app_events').insert({
    event_type: parsed.data.event,
    detail: parsed.data.detail ?? null,
    client_id: parsed.data.clientId ?? null,
    app_version: parsed.data.appVersion ?? null,
    user_agent: ua,
    user_id: userId,
  });

  if (error) {
    console.error('[telemetry/desktop]', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
