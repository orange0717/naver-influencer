/**
 * GET /api/cron/charge-recurring
 * Vercel Cron 진입점 — next_charge_at 도래한 active 구독을 batch 청구.
 *
 * vercel.json:
 *   { "path": "/api/cron/charge-recurring", "schedule": "0 0 * * *" }   (UTC 매일 00:00)
 *
 * 인증: Vercel cron 은 자동으로 'Authorization: Bearer ${CRON_SECRET}' 헤더를 붙임.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runRecurringCharges } from '@/lib/billing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5분 (Hobby 플랜은 60초 제한 — Pro 이상 필요)

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
  const result = await runRecurringCharges(Math.min(Math.max(limit, 1), 500));

  console.log('[cron/charge-recurring]', JSON.stringify(result));
  return NextResponse.json(result);
}
