import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';
/** integrity RPC + 기존 병렬 집계 */
export const maxDuration = 60;

type CrawlJob = {
  id: string;
  job_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_items: number | null;
  processed_items: number | null;
  failed_items: number | null;
  error_message: string | null;
};

function minutesSince(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

function activeInfluencerQuery(supabase: ReturnType<typeof createServiceClient>) {
  return supabase
    .from('influencers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .neq('stopped_manual', true);
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();
  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff1h = new Date(now - 60 * 60 * 1000).toISOString();

  const integrityRpc = supabase.rpc('influencer_data_integrity_summary');

  const [
    totalActiveRes,
    freshRes,
    stale24hRes,
    never,
    oldest,
    recentJobs,
    lastCrawlNullRes,
    activeLastCrawlNullRes,
    fansNoChallengeDateRes,
    ownerMissingRes,
    totalInfluencersRes,
    integrityRes,
  ] = await Promise.all([
    activeInfluencerQuery(supabase),
    activeInfluencerQuery(supabase).gte('last_crawled_at', cutoff1h),
    activeInfluencerQuery(supabase).or(`last_crawled_at.is.null,last_crawled_at.lt.${cutoff24h}`),
    activeInfluencerQuery(supabase).is('last_crawled_at', null),
    supabase
      .from('influencers')
      .select('naver_id, display_name, last_crawled_at')
      .eq('is_active', true)
      .neq('stopped_manual', true)
      .not('last_crawled_at', 'is', null)
      .order('last_crawled_at', { ascending: true })
      .limit(5),
    supabase.from('crawl_jobs').select('id, job_type, status, started_at, completed_at, total_items, processed_items, failed_items, error_message').order('started_at', { ascending: false }).limit(20),
    activeInfluencerQuery(supabase).is('last_crawled_at', null),
    activeInfluencerQuery(supabase).is('last_crawled_at', null),
    // 팬/팔로워는 있는데 네이버 챌린지 참여일(last_challenged_at) 미수신 → 공개 리스트와 체감 불일치 가능
    supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .is('last_challenged_at', null)
      .or('subscriber_count.gt.0,total_follower_count.gt.0'),
    // 참여 키워드는 있는데 naver ownerId 없음 → participated API 호출 불가
    supabase.from('influencers').select('*', { count: 'exact', head: true }).gt('total_keywords', 0).is('naver_owner_id', null),
    activeInfluencerQuery(supabase),
    integrityRpc,
  ]);

  const total = totalActiveRes.count || 0;
  const fresh1h = freshRes.count || 0;
  const stale24h = stale24hRes.count || 0;
  const neverCrawled = never.count || 0;
  const freshCount = total - stale24h;
  const coverage24hPct = total > 0 ? +(freshCount / total * 100).toFixed(2) : 0;
  const coverage1hPct = total > 0 ? +(fresh1h / total * 100).toFixed(2) : 0;

  const countOrZero = (label: string, res: { count?: number | null; error?: { message: string } | null }) => {
    if (res.error) console.error(`[crawler-stats] ${label}:`, res.error.message);
    return res.count ?? 0;
  };

  const jobs = (recentJobs.data || []) as CrawlJob[];
  const latestByType = jobs.reduce<Record<string, CrawlJob>>((acc, job) => {
    if (!acc[job.job_type]) acc[job.job_type] = job;
    return acc;
  }, {});
  const challengeJob = latestByType['crawl-challenge-ranks'];
  const aggregateJob = latestByType['aggregate-influencers'];
  const challengeLastRunMin = minutesSince(challengeJob?.started_at);
  const aggregateLastSuccessMin = aggregateJob?.status === 'success'
    ? minutesSince(aggregateJob.completed_at || aggregateJob.started_at)
    : null;

  type IntegrityRow = Record<string, unknown> | null;
  const integrityData = integrityRes.data as IntegrityRow;
  const integrityError = integrityRes.error;
  let integrity: Record<string, unknown> | null = null;
  let integrity_error: string | null = null;
  if (integrityError) {
    const msg = integrityError.message || String(integrityError);
    if (
      integrityError.code === 'PGRST202' ||
      msg.includes('influencer_data_integrity_summary') ||
      msg.includes('Could not find the function')
    ) {
      integrity_error =
        '데이터 정합성 RPC가 아직 DB에 없습니다. supabase/migrations/migration-097-influencer-data-integrity-summary.sql 을 Supabase에 적용하세요.';
    } else {
      integrity_error = msg;
    }
  } else if (integrityData && typeof integrityData === 'object') {
    integrity = integrityData as Record<string, unknown>;
  }

  const backlog = {
    last_crawl_null: countOrZero('last_crawl_null', lastCrawlNullRes),
    active_last_crawl_null: countOrZero('active_last_crawl_null', activeLastCrawlNullRes),
    fans_without_challenge_date: countOrZero('fans_without_challenge_date', fansNoChallengeDateRes),
    challenge_rows_missing_owner_id: countOrZero('challenge_rows_missing_owner_id', ownerMissingRes),
    total_influencer_rows: countOrZero('total_influencer_rows', totalInfluencersRes),
  };

  const health = {
    crawl_challenge_last_run_minutes: challengeLastRunMin,
    crawl_challenge_recent: challengeLastRunMin != null && challengeLastRunMin <= 30,
    aggregate_last_success_minutes: aggregateLastSuccessMin,
    aggregate_recent_success: aggregateLastSuccessMin != null && aggregateLastSuccessMin <= 90,
    likely_scheduler_stopped: challengeLastRunMin == null || challengeLastRunMin > 60,
    likely_backlog: stale24h > 0 && challengeLastRunMin != null && challengeLastRunMin <= 60,
  };

  return NextResponse.json({
    integrity,
    integrity_error,
    summary: {
      total_active: total,
      fresh_within_1h: fresh1h,
      fresh_within_24h: freshCount,
      stale_over_24h: stale24h,
      never_crawled: neverCrawled,
      coverage_24h_pct: coverage24hPct,
      coverage_1h_pct: coverage1hPct,
    },
    backlog,
    health,
    oldest: oldest.data || [],
    recent_jobs: jobs,
  });
}
