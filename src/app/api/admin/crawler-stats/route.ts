import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();
  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff1h = new Date(now - 60 * 60 * 1000).toISOString();

  const [totalActiveRes, freshRes, stale24hRes, never, oldest, recentJobs, lastCrawlNullRes, fansNoChallengeDateRes, ownerMissingRes, totalInfluencersRes] = await Promise.all([
    supabase.from('influencers').select('*', { count: 'exact', head: true }).gt('total_keywords', 0),
    supabase.from('influencers').select('*', { count: 'exact', head: true }).gt('total_keywords', 0).gte('last_crawled_at', cutoff1h),
    supabase.from('influencers').select('*', { count: 'exact', head: true }).gt('total_keywords', 0).or(`last_crawled_at.is.null,last_crawled_at.lt.${cutoff24h}`),
    supabase.from('influencers').select('*', { count: 'exact', head: true }).gt('total_keywords', 0).is('last_crawled_at', null),
    supabase.from('influencers').select('naver_id, display_name, last_crawled_at').gt('total_keywords', 0).not('last_crawled_at', 'is', null).order('last_crawled_at', { ascending: true }).limit(5),
    supabase.from('crawl_jobs').select('id, job_type, status, started_at, completed_at, total_items, processed_items, failed_items, error_message').order('started_at', { ascending: false }).limit(20),
    // crawl-challenge-ranks 큐: last_crawled_at 미설정(첫 수집 또는 미완)
    supabase.from('influencers').select('*', { count: 'exact', head: true }).is('last_crawled_at', null),
    // 팬/팔로워는 있는데 네이버 챌린지 참여일(last_challenged_at) 미수신 → 공개 리스트와 체감 불일치 가능
    supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .is('last_challenged_at', null)
      .or('subscriber_count.gt.0,total_follower_count.gt.0'),
    // 참여 키워드는 있는데 naver ownerId 없음 → participated API 호출 불가
    supabase.from('influencers').select('*', { count: 'exact', head: true }).gt('total_keywords', 0).is('naver_owner_id', null),
    supabase.from('influencers').select('*', { count: 'exact', head: true }),
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

  const backlog = {
    last_crawl_null: countOrZero('last_crawl_null', lastCrawlNullRes),
    fans_without_challenge_date: countOrZero('fans_without_challenge_date', fansNoChallengeDateRes),
    challenge_rows_missing_owner_id: countOrZero('challenge_rows_missing_owner_id', ownerMissingRes),
    total_influencer_rows: countOrZero('total_influencer_rows', totalInfluencersRes),
  };

  return NextResponse.json({
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
    oldest: oldest.data || [],
    recent_jobs: recentJobs.data || [],
  });
}
