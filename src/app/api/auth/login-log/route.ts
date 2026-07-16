import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const VALID_SOURCES = new Set(['main', 'ad']);
const VALID_RESULTS = new Set(['success', 'fail']);

/**
 * POST /api/auth/login-log
 * 로그인 시도(성공/실패+원인+소요시간)를 기록한다. 실패해도 로그인 흐름을
 * 막으면 안 되므로 항상 200을 반환하고 클라이언트에서 응답을 기다리지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const source = typeof body.source === 'string' ? body.source : '';
    const result = typeof body.result === 'string' ? body.result : '';
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 100) : null;
    const totalMs = Number.isFinite(body.totalMs) ? Math.round(body.totalMs) : null;

    if (!VALID_SOURCES.has(source) || !VALID_RESULTS.has(result)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = createServiceClient();
    await supabase.from('login_attempt_logs').insert({ source, result, reason, total_ms: totalMs });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
