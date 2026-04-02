import { createServiceClient } from '@/lib/supabase-server';

const PROFILE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 네이버 프로필에서 최신 팔로워수 가져와 DB 갱신 (6시간 캐시) */
export async function refreshFollowerCount(
  supabase: ReturnType<typeof createServiceClient>,
  influencerId: string,
  naverId: string,
  lastCrawledAt: string | null,
): Promise<number | null> {
  // updated_at 기반 6시간 캐시 (last_crawled_at은 마지막 참여일이므로 사용하지 않음)
  const { data: infRow } = await supabase
    .from('influencers')
    .select('updated_at')
    .eq('id', influencerId)
    .single();

  if (infRow?.updated_at) {
    const elapsed = Date.now() - new Date(infRow.updated_at).getTime();
    if (elapsed < 6 * 60 * 60 * 1000) return null;
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
    const followerCount = state?.space?.data?.totalFollowerCount;

    if (followerCount && followerCount > 0) {
      const updateData: Record<string, unknown> = {
        total_follower_count: followerCount,
        updated_at: new Date().toISOString(),
      };
      // subscriberCount(팬수)도 있으면 함께 업데이트
      const subscriberCount = state?.space?.data?.subscriberCount;
      if (subscriberCount && subscriberCount > 0) {
        updateData.subscriber_count = subscriberCount;
      }
      // last_crawled_at은 업데이트하지 않음 (마지막 참여일 의미 보존 - crawl-influencers cron만 갱신)
      await supabase.from('influencers').update(updateData).eq('id', influencerId);
      return followerCount;
    }
  } catch { /* 실패해도 기존 데이터 유지 */ }
  return null;
}
