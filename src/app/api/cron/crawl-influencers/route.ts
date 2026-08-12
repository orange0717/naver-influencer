import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

// BATCH_SIZE × sleep 800ms + Feed 페이지 2회 → 10초 넘을 수 있어 명시적으로 확장.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const FEED_API_BASE = 'https://gw.in.naver.com/feed/query/v1';
const BATCH_SIZE = 12; // Vercel 60초 제한 내 안전한 키워드 수

interface FeedCreator {
  urlId?: string;
  nickname?: string;
  imageUrl?: string;
  introduction?: string;
  subscriberCount?: number;
  totalFollowerCount?: number;
  myKeywordCategory?: string;
  myKeyword?: string;
  categoryMyType?: string;
}

interface FeedItem {
  creator: FeedCreator;
}

interface NewInfluencer {
  user_id: string;
  nickname: string;
  category: string;
  discovered_at: string;
}

function fmtDiscoveredAt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Feed API에 myKeywordCategory가 없을 때 in.naver.com HTML 페이지에서 카테고리 추출 (fallback) */
async function fetchHtmlCategory(naverId: string): Promise<{ myKeywordCategory: string; categoryMyType: string }> {
  try {
    const res = await fetchWithRetry(
      `https://in.naver.com/${encodeURIComponent(naverId)}`,
      { headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } },
      0, // 재시도 0 (시간 절약)
    );
    const html = await res.text();
    const mk = html.match(/"myKeywordCategory"\s*:\s*"([^"]+)"/);
    const cmt = html.match(/"categoryMyType"\s*:\s*"([^"]+)"/);
    return { myKeywordCategory: mk?.[1] || '', categoryMyType: cmt?.[1] || '' };
  } catch {
    return { myKeywordCategory: '', categoryMyType: '' };
  }
}

/** Feed Discover API로 키워드별 인플루언서 수집 (최대 100명) */
async function fetchInfluencersByKeywordId(
  keywordId: number | string,
): Promise<FeedCreator[]> {
  const kid = String(keywordId).trim();
  if (!/^\d+$/.test(kid)) return [];

  const results: FeedCreator[] = [];
  const seenIds = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < 2; page++) {
    let url = `${FEED_API_BASE}/discover/collection/searched?keywordId=${encodeURIComponent(kid)}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url, {
        headers: { 'Referer': 'https://in.naver.com/' },
      });
      const json = await res.json();
      const items: FeedItem[] = json?.data || [];

      for (const item of items) {
        const c = item.creator;
        if (!c?.urlId || seenIds.has(c.urlId)) continue;
        seenIds.add(c.urlId);
        results.push(c);
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch {
      break;
    }
  }

  return results;
}

/** 오늘 크롤할 키워드: Tier 1(상위 6개) + Tier 2(라운드 로빈 6개) */
async function getKeywordsToCrawl(supabase: ReturnType<typeof createServiceClient>) {
  const TIER1_SIZE = 6;
  const TIER2_SIZE = BATCH_SIZE - TIER1_SIZE;

  // Tier 1: 참여자 수 상위 키워드 (매 실행마다 크롤, 중요 키워드)
  const { data: tier1 } = await supabase
    .from('keyword_challenges')
    .select('id, keyword, category, naver_keyword_id')
    .eq('is_active', true)
    .not('naver_keyword_id', 'is', null)
    .order('participant_count', { ascending: false })
    .limit(TIER1_SIZE);

  // Tier 2: 라운드 로빈 (가장 오래전에 크롤된 키워드 우선, NULL 최우선)
  const tier1Ids = (tier1 || []).map(k => k.id);
  let tier2Query = supabase
    .from('keyword_challenges')
    .select('id, keyword, category, naver_keyword_id')
    .eq('is_active', true)
    .not('naver_keyword_id', 'is', null)
    .order('influencer_crawled_at', { ascending: true, nullsFirst: true })
    .limit(TIER2_SIZE + TIER1_SIZE); // 여유분 확보 (Tier 1 중복 제거용)

  if (tier1Ids.length > 0) {
    // Supabase JS는 NOT IN을 직접 지원하지 않으므로 여유분 가져온 뒤 필터
    tier2Query = tier2Query;
  }

  const { data: tier2Raw } = await tier2Query;

  // Tier 1과 중복 제거
  const tier1IdSet = new Set(tier1Ids);
  const tier2 = (tier2Raw || []).filter(k => !tier1IdSet.has(k.id)).slice(0, TIER2_SIZE);

  // 합산
  const seen = new Set<string>();
  const result: { id: string; keyword: string; category: string; naver_keyword_id: number }[] = [];

  for (const item of [...(tier1 || []), ...tier2]) {
    if (!seen.has(item.id) && result.length < BATCH_SIZE && item.naver_keyword_id) {
      seen.add(item.id);
      result.push(item as { id: string; keyword: string; category: string; naver_keyword_id: number });
    }
  }

  return result;
}

/** 크롤 완료된 키워드의 influencer_crawled_at 업데이트 */
async function updateKeywordCrawledAt(
  supabase: ReturnType<typeof createServiceClient>,
  keywordIds: string[],
) {
  if (keywordIds.length === 0) return;
  const now = new Date().toISOString();
  for (let i = 0; i < keywordIds.length; i += 20) {
    const batch = keywordIds.slice(i, i + 20);
    await supabase
      .from('keyword_challenges')
      .update({ influencer_crawled_at: now })
      .in('id', batch);
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-influencers');
  const supabase = createServiceClient();
  let totalInfluencers = 0;
  let totalKeywordsProcessed = 0;
  let totalFailed = 0;
  // 가이드라인 3: 이번 실행에서 처음 발견된 인플루언서만 표준 포맷으로 누적
  const newlyDiscovered: NewInfluencer[] = [];
  const newlyDiscoveredSeen = new Set<string>();
  const runDiscoveredAt = fmtDiscoveredAt(new Date());

  console.log('[Cron] crawl-influencers started at', new Date().toISOString());

  try {
    const keywords = await getKeywordsToCrawl(supabase);

    if (keywords.length === 0) {
      console.log('[crawl-influencers] No keywords with naver_keyword_id found. Run crawl-keywords first.');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, message: 'No keywords to crawl', processed: 0 });
    }

    console.log(`[crawl-influencers] Processing ${keywords.length} keywords`);

    for (const kw of keywords) {
      try {
        const creators = await fetchInfluencersByKeywordId(kw.naver_keyword_id);

        if (creators.length === 0) {
          console.log(`[crawl-influencers] No results for: ${kw.keyword}`);
          await sleep(500);
          continue;
        }

        // 인플루언서 UPSERT (배치)
        for (let i = 0; i < creators.length; i += 20) {
          const batch = creators.slice(i, i + 20);

          // Naver API가 JSON에서 / → \u002F 이스케이프 시 이중 인코딩 방지
          const fix = (s: string) => s.replace(/\\u002F/g, '/');

          // Feed API의 myKeywordCategory가 비고 키워드 카테고리도 비면 HTML 페이지에서 추출
          const enriched = await Promise.all(batch.map(async (c) => {
            let mk = c.myKeywordCategory || '';
            let cmt = c.categoryMyType || '';
            if (!mk && !kw.category && c.urlId) {
              const h = await fetchHtmlCategory(c.urlId);
              mk = h.myKeywordCategory;
              if (h.categoryMyType) cmt = h.categoryMyType;
            }
            return { c, mk, cmt };
          }));

          // 가이드라인 2-③: upsert 전에 DB에 없던 naver_id를 식별 (오늘 처음 발견된 유저)
          const batchNaverIds = enriched
            .map(({ c }) => c.urlId)
            .filter((id): id is string => Boolean(id));
          const { data: existingRows } = await supabase
            .from('influencers')
            .select('naver_id')
            .in('naver_id', batchNaverIds);
          const existingSet = new Set((existingRows ?? []).map((r) => r.naver_id));

          for (const { c, mk } of enriched) {
            if (!c.urlId || existingSet.has(c.urlId) || newlyDiscoveredSeen.has(c.urlId)) continue;
            newlyDiscoveredSeen.add(c.urlId);
            newlyDiscovered.push({
              user_id: c.urlId,
              nickname: c.nickname || '',
              category: fix(mk || kw.category || ''),
              discovered_at: runDiscoveredAt,
            });
          }

          const rows = enriched.map(({ c, mk, cmt }) => ({
            naver_id: c.urlId!,
            display_name: c.nickname || '',
            profile_url: `https://in.naver.com/${c.urlId}`,
            image_url: fix(c.imageUrl || ''),
            introduction: c.introduction || '',
            subscriber_count: c.subscriberCount || 0,
            total_follower_count: c.totalFollowerCount || 0,
            // fan_count는 팬수(subscriberCount)와 항상 동일 — totalFollowerCount로 폴백하면
            // 팔로워가 팬수로 잘못 표시된다(팬≠팔로워).
            fan_count: c.subscriberCount || 0,
            my_keyword_category: fix(mk),
            my_keyword: c.myKeyword || '',
            category_my_type: fix(cmt),
            category: fix(mk || kw.category),
            // last_crawled_at은 갱신하지 않음 — crawl-challenge-ranks에서 실제 참여일로 설정
          }));

          const { error } = await supabase
            .from('influencers')
            .upsert(rows, {
              onConflict: 'naver_id',
              ignoreDuplicates: false,
            });

          if (error) {
            console.error(`[crawl-influencers] Upsert error (${kw.keyword}):`, error.message);
          }
        }

        // influencer_keywords 조인 테이블 업데이트
        // 먼저 해당 인플루언서들의 DB ID 조회
        const naverIds = creators.map(c => c.urlId!);
        const { data: dbInfluencers } = await supabase
          .from('influencers')
          .select('id, naver_id')
          .in('naver_id', naverIds);

        if (dbInfluencers && dbInfluencers.length > 0) {
          const joinRows = dbInfluencers.map(inf => ({
            influencer_id: inf.id,
            keyword_id: kw.id,
          }));

          // 배치로 upsert (충돌 시 무시)
          for (let i = 0; i < joinRows.length; i += 50) {
            const batch = joinRows.slice(i, i + 50);
            await supabase
              .from('influencer_keywords')
              .upsert(batch, {
                onConflict: 'influencer_id,keyword_id',
                ignoreDuplicates: true,
              });
          }
        }

        totalInfluencers += creators.length;
        totalKeywordsProcessed++;
        console.log(`[crawl-influencers] ${kw.keyword}: ${creators.length} influencers`);
        await sleep(800);
      } catch (err) {
        console.error(`[crawl-influencers] Error for "${kw.keyword}":`, err);
        totalFailed++;
        await sleep(500);
      }
    }

    // 처리 완료된 키워드의 influencer_crawled_at 업데이트
    const processedIds = keywords.map(k => k.id);
    await updateKeywordCrawledAt(supabase, processedIds);

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: keywords.length,
      processed_items: totalKeywordsProcessed,
      failed_items: totalFailed,
    });

    console.log(`[Cron] crawl-influencers done: ${totalKeywordsProcessed}/${keywords.length} keywords, ${totalInfluencers} influencers, ${newlyDiscovered.length} newly discovered, ${totalFailed} failed`);

    return NextResponse.json({
      success: true,
      keywords_total: keywords.length,
      keywords_processed: totalKeywordsProcessed,
      influencers_found: totalInfluencers,
      newly_discovered_count: newlyDiscovered.length,
      newly_discovered: newlyDiscovered,
      failed: totalFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-influencers] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      processed_items: totalKeywordsProcessed,
      failed_items: totalFailed,
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
