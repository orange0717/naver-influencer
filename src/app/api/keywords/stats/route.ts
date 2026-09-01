import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { emptyKeywordStats } from '@/lib/keyword/aggregate';
import { loadParticipation, statsFromSnapshot } from '@/lib/keyword/participation';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 시작만 하고 이 시간이 지나도 안 끝난 동기화는 죽은 것으로 본다(503로 영구히 막히지 않도록). */
const SYNC_IN_FLIGHT_MS = 10 * 60 * 1000;

/**
 * GET /api/keywords/stats
 *
 * 키워드 챌린지 수치의 단일 출구. 총계·TOP3·TOP10·순위 분포가 전부 여기서 나오고,
 * 전부 lib/keyword/aggregate.ts 의 버킷 합에서 파생된다.
 * user_id 는 세션에서 얻는다 — 쿼리로 받지 않는다(남의 수치 조회 방지).
 *
 * ?refresh=1 이면 응답 캐시를 우회한다. 네이버 재수집 자체는 POST /api/my/keywords/sync 가 한다.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const gate = await requireFeature(request, 'my.dashboard');
  if (gate.error) return gate.error;
  const auth = gate.authUser;

  const refresh = request.nextUrl.searchParams.get('refresh') === '1';
  const supabase = createServiceClient();

  const influencerId = (auth.user.linked_influencer_id as string | null) || null;
  // 인플루언서 홈을 아직 연결하지 않은 사용자 — 404·204 대신 빈 집계를 준다.
  if (!influencerId) return statsResponse(emptyKeywordStats(), refresh);

  const [{ data: influencer }, { data: userRow }] = await Promise.all([
    supabase
      .from('influencers')
      .select('id, category, my_keyword_category, last_crawled_at')
      .eq('id', influencerId)
      .maybeSingle(),
    supabase
      .from('users')
      .select('signup_keyword_category')
      .eq('id', auth.userId)
      .maybeSingle(),
  ]);

  if (!influencer) return statsResponse(emptyKeywordStats(), refresh);

  // /my 화면과 같은 주제 스코프를 쓴다. 스코프가 다르면 같은 화면 안에서 또 숫자가 갈린다.
  const categoryScope = (
    (userRow?.signup_keyword_category as string | null) ||
    (influencer.my_keyword_category as string | null) ||
    (influencer.category as string | null) ||
    ''
  ).trim();

  const snapshot = await loadParticipation(supabase, influencerId, {
    categoryScope,
    fallbackLastCrawledAt: (influencer.last_crawled_at as string | null) ?? null,
  });
  const stats = statsFromSnapshot(snapshot);

  // 보여줄 수치가 하나도 없는데 동기화가 돌고 있는 중이면, 0을 지어내지 말고
  // 화면이 스켈레톤을 유지하도록 503을 준다.
  if (stats.total === 0 && (await isSyncInFlight(supabase, influencerId))) {
    return NextResponse.json({ error: 'syncing' }, { status: 503 });
  }

  return statsResponse(stats, refresh);
}

function statsResponse(stats: ReturnType<typeof emptyKeywordStats>, refresh: boolean) {
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': refresh ? 'no-store' : 'private, max-age=60',
    },
  });
}

async function isSyncInFlight(
  supabase: ReturnType<typeof createServiceClient>,
  influencerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('keyword_sync_runs')
    .select('started_at')
    .eq('influencer_id', influencerId)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1);
  // keyword_sync_runs 가 아직 없으면(migration-162 미실행) '진행 중 아님'으로 본다.
  if (error || !data?.length) return false;
  const started = new Date(data[0].started_at as string).getTime();
  return Number.isFinite(started) && Date.now() - started < SYNC_IN_FLIGHT_MS;
}
