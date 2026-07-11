import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import type { ParsedRanking } from '@/lib/types';

export const dynamic = 'force-dynamic';
/** 키워드당 sleep(2s) + HTML fetch·DB upsert — 기본 서버리스 타임아웃을 넘기기 쉬움 */
export const maxDuration = 300;

const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';
const BATCH_SIZE = 20; // Vercel 60초 제한 내 안전한 키워드 수
const TODAY = () => new Date().toISOString().slice(0, 10);

// 요일별 카테고리 로테이션 — 전체 20개 균등 배분
const DAY_CATEGORIES: Record<number, string[]> = {
  0: ['여행', '푸드', '리빙'],                  // 일 (대형 3)
  1: ['뷰티', '패션', '육아'],                  // 월
  2: ['생활건강', 'IT테크', '자동차'],           // 화
  3: ['게임', '운동/레저', '프로스포츠'],         // 수
  4: ['방송/연예', '영화', '대중음악'],           // 목
  5: ['공연/전시/예술', '도서', '경제/비즈니스'],  // 금
  6: ['어학/교육', '동물/펫'],                   // 토
};

/** 네이버 인플루언서 탭 검색 HTML에서 순위 파싱 */
function parseInfluencerTab(html: string): ParsedRanking[] {
  const $ = cheerio.load(html);
  const rankings: ParsedRanking[] = [];

  // 실제 구조: li.keyword_bx._item 내에 인플루언서 정보
  const items = $('li.keyword_bx._item');

  items.each((i, el) => {
    const $el = $(el);

    // 이름: .name.elss > span.txt
    const name = $el.find('.name.elss .txt').first().text().trim();
    if (!name) return;

    // 프로필 URL: a[href*="in.naver.com"]
    const profileLink = $el.find('a[href*="in.naver.com"]').first().attr('href') || '';
    const naverId = extractNaverId(profileLink);

    // 팬 수: ._fan_count
    const fanText = $el.find('._fan_count').text().trim();
    const fanCount = parseNumberFromText(fanText);

    // 카테고리: .etc (여러 개일 수 있음 — "도서 전문블로거", "소설 전문")
    const categories: string[] = [];
    $el.find('.etc_area .etc').each((_, etcEl) => {
      const t = $(etcEl).text().trim();
      if (t) categories.push(t);
    });
    const category = categories.join(' · ') || undefined;

    // 최신 포스트 제목: .elss.tit
    const postTitle = $el.find('.elss.tit').text().trim() || undefined;

    // 최신 포스트 링크: .dsc_link
    const latestPostUrl = $el.find('.dsc_link').attr('href') || undefined;

    rankings.push({
      rank: i + 1,
      influencerName: name,
      influencerUrl: profileLink.split('?')[0], // areacode 쿼리 제거
      naverId,
      category,
      fanCount: fanCount || undefined,
      latestPostTitle: postTitle,
      latestPostUrl,
    });
  });

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
  const snapshotDate = today.toISOString().slice(0, 10);
  const todayCategories = DAY_CATEGORIES[dayOfWeek] || [];

  // ─── Tier 0: 등록 사용자 키워드 (최우선) ───
  // users.linked_influencer_id가 있는 사용자 = 로그인해서 연동한 사용자
  const { data: linkedUsers } = await supabase
    .from('users')
    .select('linked_influencer_id')
    .not('linked_influencer_id', 'is', null);

  const linkedIds = new Set<string>(
    (linkedUsers || []).map(u => u.linked_influencer_id).filter(Boolean) as string[]
  );

  // 활성 이용권 보유 인플루언서도 포함
  const { data: activeLicenses } = await supabase
    .from('licenses')
    .select('buyer_id')
    .eq('is_used', true)
    .gte('expires_at', new Date().toISOString());

  if (activeLicenses?.length) {
    const buyerIds = activeLicenses.map(l => l.buyer_id).filter(Boolean);
    if (buyerIds.length > 0) {
      const { data: infData } = await supabase
        .from('influencers')
        .select('id')
        .in('naver_id', buyerIds);
      infData?.forEach(inf => linkedIds.add(inf.id));
    }
  }

  let tier0: { id: string; keyword: string; category: string }[] = [];
  if (linkedIds.size > 0) {
    // 사용자의 참여 키워드 조회
    const { data: ikData } = await supabase
      .from('influencer_keywords')
      .select('keyword_id')
      .in('influencer_id', Array.from(linkedIds));

    const kwIds = [...new Set((ikData || []).map(k => k.keyword_id))];

    if (kwIds.length > 0) {
      // 오늘 이미 크롤된 키워드 제외
      const { data: todaysRankings } = await supabase
        .from('keyword_rankings')
        .select('keyword_id')
        .eq('snapshot_date', snapshotDate)
        .in('keyword_id', kwIds);

      const alreadyCrawled = new Set((todaysRankings || []).map(r => r.keyword_id));
      const missingKwIds = kwIds.filter(id => !alreadyCrawled.has(id));

      if (missingKwIds.length > 0) {
        const { data } = await supabase
          .from('keyword_challenges')
          .select('id, keyword, category')
          .in('id', missingKwIds)
          .eq('is_active', true);
        tier0 = data || [];
        console.log(`[crawl-rankings] Tier 0 (user keywords): ${tier0.length} missing today`);
      }
    }
  }

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

  // 중복 제거: Tier 0는 전부 포함, 나머지는 BATCH_SIZE 내에서 배분
  const seen = new Set<string>();
  const result: { id: string; keyword: string; category: string }[] = [];

  // Tier 0 (사용자 키워드)는 BATCH_SIZE 무관하게 전부 포함
  for (const item of tier0) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }

  // 나머지 Tier는 (Tier0 제외) 최대 BATCH_SIZE개까지 채우기 — 상한은 break 조건과 동일해야 함
  for (const item of [...(tier1 || []), ...tier2, ...tier3]) {
    if (!seen.has(item.id) && result.length < BATCH_SIZE + tier0.length) {
      seen.add(item.id);
      result.push(item);
    }
    if (result.length >= BATCH_SIZE + tier0.length) break;
  }

  return result;
}

export async function GET(request: NextRequest) {
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
        const res = await fetchWithRetry(url, {
          headers: {
            'Referer': 'https://search.naver.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
        });
        const html = await res.text();
        const rankings = parseInfluencerTab(html);

        if (rankings.length === 0) {
          console.log(`[crawl-rankings] No results for: ${kw.keyword}`);
          totalFailed++;
          await sleep(1000);
          continue;
        }

        // 직전 순위 데이터 조회 (rank_change 계산용)
        // 기존: snapshot_date === "어제" 한 날만 조회 → 이 크론은 Tier1(상위 100)만
        // 매일 돌고 나머지 키워드는 요일/월 단위로만 크롤되므로, 어제 크롤 안 된
        // 키워드는 매번 previous_rank 없음·rank_change 0("변동없음")으로 잘못 표시됨.
        // crawl-challenge-ranks.ts에서 이미 겪고 고친 것과 동일한 패턴 — 가장 최근
        // 스냅샷(최근 45일 이내)을 키워드별로 사용하도록 통일한다.
        const since = new Date();
        since.setDate(since.getDate() - 45);
        const sinceStr = since.toISOString().slice(0, 10);

        const { data: prevRankings } = await supabase
          .from('keyword_rankings')
          .select('influencer_id, rank_position, snapshot_date')
          .eq('keyword_id', kw.id)
          .lt('snapshot_date', snapshotDate)
          .gte('snapshot_date', sinceStr)
          .order('snapshot_date', { ascending: false });

        const prevRankMap = new Map<string, number>();
        for (const r of prevRankings || []) {
          if (!prevRankMap.has(r.influencer_id)) {
            prevRankMap.set(r.influencer_id, r.rank_position);
          }
        }

        // 인플루언서 배치 UPSERT
        // - 팬 수: UI(/api/influencers)는 subscriber_count 우선 — fan_count만 넣으면 화면과 DB가 어긋남
        // - 파싱 실패 시 0으로 덮어쓰지 않음(기존 Feed·이전 크롤 값 유지)
        // - category: 검색 스니펫은 in.naver 프로필/Feed와 표기가 달라 덮어쓰지 않음(crawl-influencers가 담당)
        const influencerRows = rankings.map(rank => {
          const fans =
            typeof rank.fanCount === 'number' && Number.isFinite(rank.fanCount) && rank.fanCount > 0
              ? rank.fanCount
              : null;
          return {
            naver_id: rank.naverId,
            display_name: rank.influencerName,
            profile_url: rank.influencerUrl || `https://in.naver.com/${rank.naverId}`,
            last_crawled_at: new Date().toISOString(),
            ...(fans != null
              ? { fan_count: fans, subscriber_count: fans, total_follower_count: fans }
              : {}),
          };
        });

        const { data: dbInfluencers } = await supabase
          .from('influencers')
          .upsert(influencerRows, { onConflict: 'naver_id' })
          .select('id, naver_id');

        const idMap = new Map<string, string>();
        dbInfluencers?.forEach(inf => idMap.set(inf.naver_id, inf.id));

        // 순위 배치 UPSERT
        const rankingRows = rankings
          .filter(rank => idMap.has(rank.naverId))
          .map(rank => {
            const infId = idMap.get(rank.naverId)!;
            const prevRank = prevRankMap.get(infId);
            const rankChange = prevRank ? prevRank - rank.rank : 0;

            return {
              keyword_id: kw.id,
              influencer_id: infId,
              rank_position: rank.rank,
              previous_rank: prevRank ?? null,
              rank_change: rankChange,
              fan_count: rank.fanCount || 0,
              is_integrated_top3: rank.rank <= 3,
              latest_post_title: rank.latestPostTitle || null,
              latest_post_url: rank.latestPostUrl || null,
              snapshot_date: snapshotDate,
              crawled_at: new Date().toISOString(),
            };
          });

        if (rankingRows.length > 0) {
          await supabase
            .from('keyword_rankings')
            .upsert(rankingRows, { onConflict: 'keyword_id,influencer_id,snapshot_date' });
        }

        totalProcessed++;
        console.log(`[crawl-rankings] ${kw.keyword}: ${rankings.length} influencers`);
        await sleep(2000); // 2초 간격
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
