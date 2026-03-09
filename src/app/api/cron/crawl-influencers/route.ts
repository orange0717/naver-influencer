import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

const FEED_API_BASE = 'https://gw.in.naver.com/feed/query/v1';
const BATCH_SIZE = 25; // Vercel 60초 제한 내 처리 가능한 키워드 수

// 요일별 카테고리 로테이션 — 전체 20개 균등 배분 (crawl-rankings와 동일)
const DAY_CATEGORIES: Record<number, string[]> = {
  0: ['여행', '푸드', '리빙'],                  // 일 (대형 3)
  1: ['뷰티', '패션', '육아'],                  // 월
  2: ['생활건강', 'IT테크', '자동차'],           // 화
  3: ['게임', '운동/레저', '프로스포츠'],         // 수
  4: ['방송/연예', '영화', '대중음악'],           // 목
  5: ['공연/전시/예술', '도서', '경제/비즈니스'],  // 금
  6: ['어학/교육', '동물/펫'],                   // 토
};

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

/** Feed Discover API로 키워드별 인플루언서 수집 (최대 100명) */
async function fetchInfluencersByKeywordId(
  keywordId: number,
): Promise<FeedCreator[]> {
  const results: FeedCreator[] = [];
  const seenIds = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < 2; page++) {
    let url = `${FEED_API_BASE}/discover/collection/searched?keywordId=${keywordId}&limit=50`;
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

/** 오늘 크롤할 키워드 목록 (naver_keyword_id가 있는 것만) */
async function getKeywordsToCrawl(supabase: ReturnType<typeof createServiceClient>) {
  const dayOfWeek = new Date().getDay();
  const todayCategories = DAY_CATEGORIES[dayOfWeek] || [];

  // Tier 1: 참여자 수 상위 키워드 (매일)
  const { data: tier1 } = await supabase
    .from('keyword_challenges')
    .select('id, keyword, category, naver_keyword_id')
    .eq('is_active', true)
    .not('naver_keyword_id', 'is', null)
    .order('participant_count', { ascending: false })
    .limit(50);

  // Tier 2: 오늘 해당 카테고리 (요일 로테이션)
  let tier2: typeof tier1 = [];
  if (todayCategories.length > 0) {
    const { data } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category, naver_keyword_id')
      .eq('is_active', true)
      .not('naver_keyword_id', 'is', null)
      .in('category', todayCategories)
      .order('participant_count', { ascending: false })
      .limit(100);
    tier2 = data || [];
  }

  // 중복 제거 + BATCH_SIZE 제한
  const seen = new Set<string>();
  const result: { id: string; keyword: string; category: string; naver_keyword_id: number }[] = [];

  for (const item of [...(tier1 || []), ...(tier2 || [])]) {
    if (!seen.has(item.id) && result.length < BATCH_SIZE && item.naver_keyword_id) {
      seen.add(item.id);
      result.push(item as { id: string; keyword: string; category: string; naver_keyword_id: number });
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-influencers');
  const supabase = createServiceClient();
  let totalInfluencers = 0;
  let totalKeywordsProcessed = 0;
  let totalFailed = 0;

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

          const rows = batch.map(c => ({
            naver_id: c.urlId!,
            display_name: c.nickname || '',
            profile_url: `https://in.naver.com/${c.urlId}`,
            image_url: c.imageUrl || '',
            introduction: c.introduction || '',
            subscriber_count: c.subscriberCount || 0,
            total_follower_count: c.totalFollowerCount || 0,
            my_keyword_category: c.myKeywordCategory || '',
            my_keyword: c.myKeyword || '',
            category_my_type: c.categoryMyType || '',
            category: c.myKeywordCategory || kw.category,
            last_crawled_at: new Date().toISOString(),
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

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: keywords.length,
      processed_items: totalKeywordsProcessed,
      failed_items: totalFailed,
    });

    console.log(`[Cron] crawl-influencers done: ${totalKeywordsProcessed}/${keywords.length} keywords, ${totalInfluencers} influencers, ${totalFailed} failed`);

    return NextResponse.json({
      success: true,
      keywords_total: keywords.length,
      keywords_processed: totalKeywordsProcessed,
      influencers_found: totalInfluencers,
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
