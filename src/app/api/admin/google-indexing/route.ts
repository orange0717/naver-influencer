import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_AGGREGATE_ROWS = 5000;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  const [jobsRes, statusRowsRes, failureRowsRes] = await Promise.all([
    supabase
      .from('crawl_jobs')
      .select('id, job_type, status, started_at, completed_at, total_items, processed_items, failed_items, error_message')
      .eq('job_type', 'google-indexing-poll')
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('indexed_urls')
      .select('user_id, status')
      .order('registered_at', { ascending: false })
      .limit(MAX_AGGREGATE_ROWS),
    supabase
      .from('indexed_urls')
      .select('id, user_id, blog_id, url, title, status, failure_reason_code, error_message, updated_at')
      .in('status', ['error', 'not_indexed'])
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  const statusRows = statusRowsRes.data ?? [];
  const statusCounts: Record<string, number> = {};
  const perUserCounts = new Map<string, number>();
  for (const row of statusRows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    perUserCounts.set(row.user_id, (perUserCounts.get(row.user_id) ?? 0) + 1);
  }

  const topUserIds = [...perUserCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  let perUserUsage: { userId: string; email: string | null; blogId: string | null; count: number }[] = [];
  if (topUserIds.length > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, email, blog_id')
      .in('id', topUserIds.map(([id]) => id));
    const userMap = new Map((usersData ?? []).map((u) => [u.id, u]));
    perUserUsage = topUserIds.map(([userId, count]) => ({
      userId,
      email: userMap.get(userId)?.email ?? null,
      blogId: userMap.get(userId)?.blog_id ?? null,
      count,
    }));
  }

  return NextResponse.json({
    recentJobs: jobsRes.data ?? [],
    statusCounts,
    totalRegistered: statusRows.length,
    apiCallsLast20Jobs: (jobsRes.data ?? []).reduce((sum, j) => sum + (j.processed_items ?? 0), 0),
    failures: failureRowsRes.data ?? [],
    perUserUsage,
  });
}
