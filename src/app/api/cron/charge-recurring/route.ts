/**
 * GET /api/cron/charge-recurring
 * Vercel Cron 진입점 — next_charge_at 도래한 active 구독을 batch 청구.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/crawler';
import { runRecurringCharges } from '@/lib/billing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
  const result = await runRecurringCharges(Math.min(Math.max(limit, 1), 500));

  console.log('[cron/charge-recurring]', JSON.stringify(result));
  return NextResponse.json(result);
}
