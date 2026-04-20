import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/cleanup-intents
 * 매일 실행: 만료된 payment_intents 레코드 정리
 * migration-056 의 cleanup_expired_payment_intents() 호출.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('cleanup_expired_payment_intents');

  if (error) {
    console.error('[cleanup-intents] RPC 실패:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deletedCount: data ?? 0 });
}
