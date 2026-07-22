import { createServiceClient } from '@/lib/supabase-server';

const PROFILE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';

/** KST 달력일 + 6시간 슬롯(0=00–06, 1=06–12, 2=12–18, 3=18–24) — 프로필 새로고침 캐시 키 */
function kstDateAndSlot(date: Date): { ymd: string; slot: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value ?? '1970';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const d = parts.find(p => p.type === 'day')?.value ?? '01';
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  return { ymd: `${y}-${m}-${d}`, slot: Math.floor(h / 6) };
}

/** 마지막 갱신(updated_at)과 지금이 같은 KST 6시간 창이면 스킵 (경과 6시간이 아니라 고정 창) */
function profileRefreshAllowedSinceLastUpdate(lastUpdatedAtIso: string | null | undefined, now = new Date()): boolean {
  if (!lastUpdatedAtIso) return true;
  const last = kstDateAndSlot(new Date(lastUpdatedAtIso));
  const cur = kstDateAndSlot(now);
  if (last.ymd !== cur.ymd) return true;
  return last.slot !== cur.slot;
}

export interface FreshProfile {
  total_follower_count: number | null;
  subscriber_count: number | null;
  total_keywords: number | null;
}

/** 네이버 인플홈에서 최신 팬수/팔로워수/참여 키워드 수를 가져와 DB 갱신 (KST 6시간 창당 최대 1회) */
export async function refreshFollowerCount(
  supabase: ReturnType<typeof createServiceClient>,
  influencerId: string,
  naverId: string,
): Promise<number | null> {
  const fresh = await refreshInfluencerProfile(supabase, influencerId, naverId);
  return fresh?.total_follower_count ?? null;
}

/** 인플홈(__PRELOADED_STATE__) + 참여키워드 API에서 최신값을 모아 DB 갱신. KST 0·6·12·18시 경계마다 최대 1회. */
export async function refreshInfluencerProfile(
  supabase: ReturnType<typeof createServiceClient>,
  influencerId: string,
  naverId: string,
): Promise<FreshProfile | null> {
  // updated_at 기반: KST 6시간 고정 창(0·6·12·18시 경계)당 최대 1회
  const { data: infRow, error: infRowError } = await supabase
    .from('influencers')
    .select('updated_at')
    .eq('id', influencerId)
    .single();

  if (infRowError || !infRow) {
    if (infRowError) console.error(`[refresh-follower] influencer lookup failed for ${influencerId}:`, infRowError.message);
    return null;
  }

  if (infRow?.updated_at) {
    if (!profileRefreshAllowedSinceLastUpdate(infRow.updated_at)) return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://in.naver.com/${naverId}`, {
      signal: controller.signal,
      headers: { 'User-Agent': PROFILE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: 'https://in.naver.com/' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return null;

    const jsonStart = html.indexOf('{', idx);
    let depth = 0, jsonEnd = -1;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
    }
    if (jsonEnd === -1) return null;

    const state = JSON.parse(html.substring(jsonStart, jsonEnd));
    const followerCount: number | undefined = state?.space?.data?.totalFollowerCount;
    // subscriberCount 는 2026-04 경부터 data.stats 하위로 이동됨. legacy 경로도 폴백.
    const subscriberCount: number | undefined =
      state?.space?.data?.stats?.subscriberCount ?? state?.space?.data?.subscriberCount;
    const ownerId: string | number | undefined = state?.space?.data?.ownerId;
    const lastChallengedAt: string | undefined = state?.space?.data?.keywordChallengeInfo?.lastChallengedAt;

    // 참여 키워드 총개수 실시간 조회 (paging.total만 필요하므로 limit=1)
    let totalKeywords: number | null = null;
    if (ownerId) {
      try {
        const kwController = new AbortController();
        const kwTimeout = setTimeout(() => kwController.abort(), 5000);
        const kwRes = await fetch(`${PARTICIPATED_API}?ownerId=${ownerId}&limit=1`, {
          signal: kwController.signal,
          headers: { 'User-Agent': PROFILE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: `https://in.naver.com/${naverId}` },
        });
        clearTimeout(kwTimeout);
        if (kwRes.ok) {
          const kwJson = await kwRes.json();
          const total = kwJson?.paging?.total;
          if (typeof total === 'number' && total >= 0) totalKeywords = total;
        }
      } catch (err) {
        console.warn(`[refresh-follower] participated-keywords ${naverId} 실패:`, err instanceof Error ? err.message : err);
      }
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (followerCount && followerCount > 0) updateData.total_follower_count = followerCount;
    if (subscriberCount && subscriberCount > 0) updateData.subscriber_count = subscriberCount;
    if (totalKeywords !== null) updateData.total_keywords = totalKeywords;
    // 참여 시각은 last_challenged_at에만 기록 (last_crawled_at은 crawl-challenge-ranks 전용)
    if (lastChallengedAt) {
      updateData.last_challenged_at = new Date(lastChallengedAt).toISOString();
    }
    if (ownerId != null && ownerId !== '') {
      updateData.naver_owner_id = String(ownerId);
    }

    // 갱신할 실제 값이 하나도 없으면 updated_at만 찍지 말고 포기
    if (Object.keys(updateData).length <= 1) return null;

    await supabase.from('influencers').update(updateData).eq('id', influencerId);

    return {
      total_follower_count: followerCount ?? null,
      subscriber_count: subscriberCount ?? null,
      total_keywords: totalKeywords,
    };
  } catch (err) {
    console.warn(`[refresh-follower] ${naverId} 실패:`, err instanceof Error ? err.message : err);
  }
  return null;
}
