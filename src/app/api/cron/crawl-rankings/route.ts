import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import type { ParsedRanking } from '@/lib/types';

const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';
const BATCH_SIZE = 30; // 60초 제한 내 처리 가능한 키워드 수
const TODAY = () => new Date().toISOString().slice(0, 10);

// 요일별 카테고리 로테이션 (Tier 2)
const DAY_CATEGORIES: Record<number, string[]> = {
  0: ['여행', '뷰티'],       // 일
  1: ['푸드', '리빙'],       // 월
  2: ['건강', '육아'],       // 화
  3: ['패션', '문화'],       // 수
  4: ['자기계발', 'IT'],     // 목
  5: ['스포츠', '시사경제'],  // 금
  6: ['자동차', '도서', '동물'], // 토
};

/** 네이버 인플루언서 탭 검색 HTML에서 순위 파싱 */
function parseInfluencerTab(html: string): ParsedRanking[] {
  const $ = cheerio.load(html);
  const rankings: ParsedRanking[] = [];

  // 인플루언서 검색 결과 영역
  // 네이버 인플루언서 탭: .influencer_list 또는 .api_subject_bx 내 결과
  const items = $('[class*="influencer"] [class*="item"], .api_subject_bx .item, .influencer_info_area, [class*="inf_item"]');

  if (items.length === 0) {
    // 대체 셀렉터: 일반 검색 결과 내 인플루언서 섹션
    const altItems = $('li[class*="bx"], .lst_total .bx, [data-cr-area="inf"]');
    altItems.each((i, el) => {
      const $el = $(el);
      const nameEl = $el.find('a[class*="name"], .name, .tit, .info_area .name_txt');
      const name = nameEl.text().trim();
      const profileLink = nameEl.attr('href') || $el.find('a').first().attr('href') || '';

      if (!name) return;

      const naverId = extractNaverId(profileLink);
      const category = $el.find('[class*="category"], .sub_txt, .tag').first().text().trim();
      const fanText = $el.find('[class*="fan"], [class*="follower"]').text();
      const fanCount = parseNumberFromText(fanText);
      const postTitle = $el.find('[class*="title"], .total_tit, .api_txt_lines').first().text().trim();

      rankings.push({
        rank: i + 1,
        influencerName: name,
        influencerUrl: profileLink,
        naverId,
        category: category || undefined,
        fanCount: fanCount || undefined,
        latestPostTitle: postTitle || undefined,
      });
    });
  } else {
    items.each((i, el) => {
      const $el = $(el);
      const nameEl = $el.find('a[class*="name"], .name, .tit');
      const name = nameEl.text().trim();
      const profileLink = nameEl.attr('href') || '';

      if (!name) return;

      const naverId = extractNaverId(profileLink);
      const category = $el.find('[class*="category"], .sub_txt').first().text().trim();
      const fanText = $el.find('[class*="fan"], [class*="follower"]').text();
      const fanCount = parseNumberFromText(fanText);
      const postTitle = $el.find('[class*="title"], .total_tit').first().text().trim();

      rankings.push({
        rank: i + 1,
        influencerName: name,
        influencerUrl: profileLink,
        naverId,
        category: category || undefined,
        fanCount: fanCount || undefined,
        latestPostTitle: postTitle || undefined,
      });
    });
  }

  return rankings;
}

/** 프로필 URL에서 네이버 ID 추출 */
function extractNaverId(url: string): string {
  // https://in.naver.com/orangelibrary → orangelibrary
  const match = url.match(/in\.naver\.com\/([^/?#]+)/);
  if (match) return match[1];
  // https://blog.naver.com/orangelibrary → orangelibrary
  const blogMatch = url.match(/blog\.naver\.com\/([^/?#]+)/);
  if (blogMatch) return blogMatch[1];
  return url.replace(/https?:\/\//, '').split('/').pop() || '';
}

/** 텍스트에서 숫자 추출 (팬 1.2만 → 12000) */
function parseNumberFromText(text: string): number {
  if (!text) return 0;
  const match = text.match(/([\d,.]+)\s*만/);
  if (match) return Math.round(parseFloat(match[1].replace(/,/g, '')) * 10000);
  const numMatch = text.match(/([\d,]+)/);
  if (numMatch) return parseInt(numMatch[1].replace(/,/g, ''), 10);
  return 0;
}

/** 오늘 크롤할 키워드 목록 조회 */
async function getKeywordsToCrawl(supabase: ReturnType<typeof createServiceClient>) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();
  const todayCategories = DAY_CATEGORIES[dayOfWeek] || [];

  // Tier 1: 검색량 상위 키워드 (매일)
  const { data: tier1 } = await supabase
    .from('keyword_challenges')
    .select('id, keyword, category')
    .eq('is_active', true)
    .order('search_volume_monthly', { ascending: false, nullsFirst: false })
    .limit(100);

  // Tier 2: 오늘 해당 카테고리 키워드 (요일 로테이션)
  let tier2: typeof tier1 = [];
  if (todayCategories.length > 0) {
    const { data } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category')
      .eq('is_active', true)
      .in('category', todayCategories)
      .order('participant_count', { ascending: false })
      .limit(200);
    tier2 = data || [];
  }

  // Tier 3: 월 1일에 전체 리프레시 (참여자 많은 순)
  let tier3: typeof tier1 = [];
  if (dayOfMonth === 1) {
    const { data } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category')
      .eq('is_active', true)
      .order('participant_count', { ascending: false })
      .limit(500);
    tier3 = data || [];
  }

  // 중복 제거 후 BATCH_SIZE로 제한
  const seen = new Set<string>();
  const result: { id: string; keyword: string; category: string }[] = [];

  for (const item of [...(tier1 || []), ...tier2, ...tier3]) {
    if (!seen.has(item.id) && result.length < BATCH_SIZE) {
      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-rankings');
  const supabase = createServiceClient();
  const snapshotDate = TODAY();
  let totalProcessed = 0;
  let totalFailed = 0;

  console.log('[Cron] Step 2: crawl-rankings started at', new Date().toISOString());

  try {
    const keywords = await getKeywordsToCrawl(supabase);

    if (keywords.length === 0) {
      console.log('[crawl-rankings] No keywords found to crawl. Run crawl-keywords first.');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, message: 'No keywords to crawl', processed: 0 });
    }

    console.log(`[crawl-rankings] Crawling ${keywords.length} keywords`);

    for (const kw of keywords) {
      try {
        // 인플루언서 탭 검색
        const url = `${NAVER_SEARCH_URL}?where=influencer&query=${encodeURIComponent(kw.keyword)}`;
        const res = await fetchWithRetry(url);
        const html = await res.text();
        const rankings = parseInfluencerTab(html);

        if (rankings.length === 0) {
          console.log(`[crawl-rankings] No results for: ${kw.keyword}`);
          totalFailed++;
          await sleep(1000);
          continue;
        }

        // 전일 순위 데이터 조회 (rank_change 계산용)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        const { data: prevRankings } = await supabase
          .from('keyword_rankings')
          .select('influencer_id, rank_position')
          .eq('keyword_id', kw.id)
          .eq('snapshot_date', yesterdayStr);

        const prevRankMap = new Map<string, number>();
        prevRankings?.forEach(r => prevRankMap.set(r.influencer_id, r.rank_position));

        // 인플루언서 UPSERT + 순위 INSERT
        for (const rank of rankings) {
          // influencers 테이블에 UPSERT
          const { data: inf } = await supabase
            .from('influencers')
            .upsert(
              {
                naver_id: rank.naverId,
                display_name: rank.influencerName,
                profile_url: rank.influencerUrl || `https://in.naver.com/${rank.naverId}`,
                category: rank.category || kw.category,
                fan_count: rank.fanCount || 0,
                last_crawled_at: new Date().toISOString(),
              },
              { onConflict: 'naver_id' },
            )
            .select('id')
            .single();

          if (!inf) continue;

          const prevRank = prevRankMap.get(inf.id);
          const rankChange = prevRank ? prevRank - rank.rank : 0;

          // keyword_rankings 테이블에 UPSERT (같은 날 같은 키워드+인플루언서 중복 방지)
          await supabase.from('keyword_rankings').upsert(
            {
              keyword_id: kw.id,
              influencer_id: inf.id,
              rank_position: rank.rank,
              previous_rank: prevRank ?? null,
              rank_change: rankChange,
              fan_count: rank.fanCount || 0,
              is_integrated_top3: rank.rank <= 3,
              latest_post_title: rank.latestPostTitle || null,
              snapshot_date: snapshotDate,
              crawled_at: new Date().toISOString(),
            },
            { onConflict: 'keyword_id,influencer_id,snapshot_date' },
          );
        }

        totalProcessed++;
        console.log(`[crawl-rankings] ${kw.keyword}: ${rankings.length} influencers`);
        await sleep(1200); // 1.2초 간격
      } catch (err) {
        console.error(`[crawl-rankings] Error for "${kw.keyword}":`, err);
        totalFailed++;
        await sleep(1000);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: keywords.length,
      processed_items: totalProcessed,
      failed_items: totalFailed,
    });

    console.log(`[Cron] Step 2 done: ${totalProcessed}/${keywords.length} keywords, ${totalFailed} failed`);

    return NextResponse.json({
      success: true,
      step: 2,
      total: keywords.length,
      processed: totalProcessed,
      failed: totalFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-rankings] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      processed_items: totalProcessed,
      failed_items: totalFailed,
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
