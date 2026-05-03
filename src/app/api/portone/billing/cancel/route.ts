/**
 * POST /api/portone/billing/cancel
 * 구독 취소.
 * Body: { immediate?: boolean }
 *   - immediate=true  → 즉시 취소 (빌링키 삭제 + status='cancelled')
 *   - immediate=false → 다음 결제일 도래 시 취소 (cancel_at_period_end=true)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { cancelSubscription } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { immediate?: boolean };

    const supa = await createRouteHandlerClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const result = await cancelSubscription({
      userId: user.id,
      immediate: !!body.immediate,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[/api/portone/billing/cancel] error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
