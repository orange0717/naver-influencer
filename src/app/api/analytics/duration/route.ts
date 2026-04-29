import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * 페이지 체류시간 보고 (VisitTracker 가 pagehide/visibilitychange 시 sendBeacon 으로 호출).
 *
 * sendBeacon 은 커스텀 헤더를 보낼 수 없으므로 Authorization 인증 없이 동작한다.
 * id 는 직전 /api/analytics/track 응답에서 받은 visit_logs.id.
 *
 * 보호 장치:
 *   - duration 은 0–3600 초로 캡 (음수/비정상 큰 값 차단)
 *   - 이미 duration_seconds 가 채워진 row 는 갱신하지 않음 (덮어쓰기 방지)
 *   - rate limit 적용
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (await dashboardLimiter.check(`duration:${ip}`)) {
      return NextResponse.json({ ok: true, skipped: 'rate_limit' });
    }

    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    const rawDuration = Number(body?.duration);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid_id' });
    }
    if (!Number.isFinite(rawDuration) || rawDuration < 0) {
      return NextResponse.json({ ok: false, error: 'invalid_duration' });
    }

    const duration = Math.min(Math.floor(rawDuration), 3600);

    const supabase = createServiceClient();
    await supabase
      .from('visit_logs')
      .update({ duration_seconds: duration })
      .eq('id', id)
      .is('duration_seconds', null);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
