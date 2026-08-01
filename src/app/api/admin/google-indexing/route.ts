import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { getValidAccessToken } from '@/lib/google-oauth';
import { listSites, GoogleApiError } from '@/lib/google-search-console';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_AGGREGATE_ROWS = 5000;
const MAX_OAUTH_DIAGNOSTICS = 20;

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
      .select('id, user_id, blog_id, url, title, status, failure_reason_code, error_code, http_status, retryable, error_message, updated_at')
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

  // Google 계정은 연결됐지만 GSC 속성(site_url)이 확인되지 않은 사용자는
  // 실제로 Google 계정에 어떤 GSC 속성이 보이는지 지금 이 순간 살아있는 API로
  // 직접 확인해본다 — "권한이 없는 것"과 "블로그 URL을 아직 소유권 확인 안 한 것"을
  // 코드만으로는 구분할 수 없어서 실시간 진단이 필요함.
  const { data: oauthRows } = await supabase
    .from('google_oauth_tokens')
    .select('user_id, google_email, site_url, site_verified, updated_at')
    .order('updated_at', { ascending: false })
    .limit(MAX_OAUTH_DIAGNOSTICS);

  const oauthUserIds = (oauthRows ?? []).map((r) => r.user_id);
  const { data: oauthUsersData } = oauthUserIds.length
    ? await supabase.from('users').select('id, email, blog_id').in('id', oauthUserIds)
    : { data: [] as { id: string; email: string | null; blog_id: string | null }[] };
  const oauthUserMap = new Map((oauthUsersData ?? []).map((u) => [u.id, u]));

  const oauthDiagnostics = await Promise.all(
    (oauthRows ?? []).map(async (row) => {
      const base = {
        userId: row.user_id,
        email: oauthUserMap.get(row.user_id)?.email ?? null,
        blogId: oauthUserMap.get(row.user_id)?.blog_id ?? null,
        googleEmail: row.google_email,
        siteUrl: row.site_url,
        siteVerified: row.site_verified,
        updatedAt: row.updated_at,
      };
      if (row.site_verified && row.site_url) {
        return { ...base, liveSites: null, liveSitesError: null }; // 이미 확인됨 — 굳이 호출 안 함
      }
      try {
        const conn = await getValidAccessToken(row.user_id);
        if (!conn) return { ...base, liveSites: null, liveSitesError: 'getValidAccessToken이 null 반환 (토큰 행 없음/디코딩 실패)' };
        const sites = await listSites(conn.accessToken);
        return { ...base, liveSites: sites, liveSitesError: null };
      } catch (err) {
        const msg = err instanceof GoogleApiError
          ? `HTTP ${err.httpStatus}: ${err.responseBody}`
          : err instanceof Error ? err.message : String(err);
        return { ...base, liveSites: null, liveSitesError: msg };
      }
    }),
  );

  return NextResponse.json({
    recentJobs: jobsRes.data ?? [],
    statusCounts,
    totalRegistered: statusRows.length,
    apiCallsLast20Jobs: (jobsRes.data ?? []).reduce((sum, j) => sum + (j.processed_items ?? 0), 0),
    failures: failureRowsRes.data ?? [],
    perUserUsage,
    oauthDiagnostics,
  });
}
