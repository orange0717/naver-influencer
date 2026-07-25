import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDayStartIso(atMs: number): string {
  const kst = new Date(atMs + KST_OFFSET_MS);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET_MS).toISOString();
}

/** GET /api/google-indexing/summary — 대시보드 카드 집계 */
export async function GET(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const supabase = createServiceClient();
  const userId = paid.authUser.userId;
  const now = Date.now();
  const todayStart = kstDayStartIso(now);
  const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [todayRes, weekRes, totalRes, indexedRes, notIndexedRes, recentRes] = await Promise.all([
    supabase.from('indexed_urls').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('registered_at', todayStart),
    supabase.from('indexed_urls').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('registered_at', weekStart),
    supabase.from('indexed_urls').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('indexed_urls').select('registered_at, indexed_at').eq('user_id', userId).eq('status', 'indexed').order('indexed_at', { ascending: false }).limit(200),
    supabase.from('indexed_urls').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'not_indexed'),
    supabase.from('indexed_urls').select('id, url, title, status, registered_at').eq('user_id', userId).order('registered_at', { ascending: false }).limit(5),
  ]);

  const total = totalRes.count ?? 0;
  const indexedRows = indexedRes.data ?? [];
  const indexedCount = indexedRows.length;
  const successRate = total > 0 ? Math.round((indexedCount / total) * 1000) / 10 : 0;

  const durationsMs = indexedRows
    .filter((r) => r.registered_at && r.indexed_at)
    .map((r) => new Date(r.indexed_at!).getTime() - new Date(r.registered_at).getTime())
    .filter((ms) => ms >= 0);
  const avgProcessingHours =
    durationsMs.length > 0
      ? Math.round((durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / (60 * 60 * 1000)) * 10) / 10
      : null;

  return NextResponse.json({
    userId,
    todayCount: todayRes.count ?? 0,
    weekCount: weekRes.count ?? 0,
    successRate,
    notIndexedCount: notIndexedRes.count ?? 0,
    avgProcessingHours,
    recent: recentRes.data ?? [],
  });
}
