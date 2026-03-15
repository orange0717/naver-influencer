import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PAGE_LIMIT = 50;
const BATCH_SIZE = 20; // Vercel 60초 제한 고려: 인플루언서 20명씩 처리
const TODAY = () => new Date().toISOString().slice(0, 10);

interface ParticipatedKeyword {
  id: number; // naver_keyword_id
  name: string;
  categoryId: number;
  rank: number;
  challengeCount: number;
  lastChallengedAt: string;
  thumbnailUrl?: string;
}

/** 인플루언서 프로필 페이지에서 ownerId 추출 */
async function fetchOwnerId(naverId: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`https://in.naver.com/${naverId}`, {
      headers: { Referer: 'https://in.naver.com/' },
    });
    const html = await res.text();

    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return null;

    const jsonStart = html.indexOf('{', idx);
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
    if (jsonEnd === -1) return null;

    const state = JSON.parse(html.substring(jsonStart, jsonEnd));
    const ownerId = state?.space?.data?.ownerId;
    return ownerId ? String(ownerId) : null;
  } catch (err) {
    console.error(`[crawl-challenge-ranks] Failed to fetch ownerId for ${naverId}:`, err);
    return null;
  }
}

/** REST API로 인플루언서의 전체 참여 키워드+순위 가져오기 */
async function fetchAllParticipatedKeywords(ownerId: string): Promise<ParticipatedKeyword[]> {
  const results: ParticipatedKeyword[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    let url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=${PAGE_LIMIT}`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url, {
        headers: { Referer: 'https://in.naver.com/' },
      });
      const json = await res.json();
      const items: ParticipatedKeyword[] = json?.data || [];

      results.push(...items);

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < PAGE_LIMIT) break;

      await sleep(300);
    } catch (err) {
      console.error(`[crawl-challenge-ranks] API error at page ${page}:`, err);
      break;
    }
  }

  return results;
}

/** 크롤할 인플루언서 목록 조회 */
async function getInfluencersToCrawl(supabase: ReturnType<typeof createServiceClient>) {
  // 우선순위 1: 사용자가 연결한 인플루언서
  const { data: linked } = await supabase
    .from('users')
    .select('linked_influencer_id')
    .not('linked_influencer_id', 'is', null);

  const linkedIds = new Set((linked || []).map(u => u.linked_influencer_id));

  // 우선순위 2: 챌린지 순위 크롤이 오래된 인플루언서 우선 (ASC)
  const { data: recent } = await supabase
    .from('influencers')
    .select('id, naver_id, naver_owner_id')
    .not('last_crawled_at', 'is', null)
    .order('last_crawled_at', { ascending: true })
    .limit(100);

  // 연결된 인플루언서 우선 + 나머지
  const seen = new Set<string>();
  const result: { id: string; naver_id: string; naver_owner_id: string | null }[] = [];

  // 연결된 인플루언서 먼저
  if (linkedIds.size > 0 && recent) {
    for (const inf of recent) {
      if (linkedIds.has(inf.id) && !seen.has(inf.id)) {
        seen.add(inf.id);
        result.push(inf);
      }
    }
  }

  // 나머지 채우기
  if (recent) {
    for (const inf of recent) {
      if (!seen.has(inf.id) && result.length < BATCH_SIZE) {
        seen.add(inf.id);
        result.push(inf);
      }
    }
  }

  return result.slice(0, BATCH_SIZE);
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-challenge-ranks');
  const supabase = createServiceClient();
  const snapshotDate = TODAY();
  let totalProcessed = 0;
  let totalKeywords = 0;
  let totalFailed = 0;

  // ?naver_id=xxx 파라미터로 특정 인플루언서만 처리 가능
  const targetNaverId = request.nextUrl.searchParams.get('naver_id');

  console.log('[Cron] crawl-challenge-ranks started at', new Date().toISOString());

  try {
    let influencers: { id: string; naver_id: string; naver_owner_id: string | null }[];

    if (targetNaverId) {
      const { data } = await supabase
        .from('influencers')
        .select('id, naver_id, naver_owner_id')
        .eq('naver_id', targetNaverId)
        .limit(1);
      influencers = data || [];
    } else {
      influencers = await getInfluencersToCrawl(supabase);
    }

    if (influencers.length === 0) {
      console.log('[crawl-challenge-ranks] No influencers to crawl.');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, message: 'No influencers', processed: 0 });
    }

    console.log(`[crawl-challenge-ranks] Processing ${influencers.length} influencers`);

    for (const inf of influencers) {
      try {
        // 1. ownerId 확보
        let ownerId = inf.naver_owner_id;
        if (!ownerId) {
          ownerId = await fetchOwnerId(inf.naver_id);
          if (!ownerId) {
            console.log(`[crawl-challenge-ranks] Cannot get ownerId for ${inf.naver_id}`);
            totalFailed++;
            continue;
          }
          // DB에 저장
          await supabase
            .from('influencers')
            .update({ naver_owner_id: ownerId })
            .eq('id', inf.id);
          await sleep(500);
        }

        // 2. 전체 참여 키워드+순위 가져오기
        const keywords = await fetchAllParticipatedKeywords(ownerId);
        if (keywords.length === 0) {
          console.log(`[crawl-challenge-ranks] No keywords for ${inf.naver_id}`);
          totalFailed++;
          continue;
        }

        // 3. naver_keyword_id로 keyword_challenges 매칭
        const naverKeywordIds = keywords.map(k => k.id);

        // 배치로 조회 (1000개 단위)
        const keywordMap = new Map<number, string>(); // naver_keyword_id → keyword_challenges.id
        for (let i = 0; i < naverKeywordIds.length; i += 500) {
          const batch = naverKeywordIds.slice(i, i + 500);
          const { data: dbKeywords } = await supabase
            .from('keyword_challenges')
            .select('id, naver_keyword_id')
            .in('naver_keyword_id', batch);

          dbKeywords?.forEach(kw => {
            if (kw.naver_keyword_id) keywordMap.set(kw.naver_keyword_id, kw.id);
          });
        }

        // 4. 전일 순위 조회 (rank_change 계산용)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        const { data: prevRankings } = await supabase
          .from('keyword_rankings')
          .select('keyword_id, rank_position')
          .eq('influencer_id', inf.id)
          .eq('snapshot_date', yesterdayStr);

        const prevRankMap = new Map<string, number>();
        prevRankings?.forEach(r => prevRankMap.set(r.keyword_id, r.rank_position));

        // 5. keyword_rankings UPSERT (배치)
        let batchCount = 0;
        const upsertRows: Array<{
          keyword_id: string;
          influencer_id: string;
          rank_position: number;
          previous_rank: number | null;
          rank_change: number;
          is_integrated_top3: boolean;
          snapshot_date: string;
          crawled_at: string;
        }> = [];

        for (const kw of keywords) {
          const keywordId = keywordMap.get(kw.id);
          if (!keywordId) continue; // DB에 없는 키워드는 스킵
          if (!kw.rank && kw.rank !== 0) continue; // rank가 null/undefined면 스킵

          const prevRank = prevRankMap.get(keywordId);
          const rankChange = prevRank ? prevRank - kw.rank : 0;

          upsertRows.push({
            keyword_id: keywordId,
            influencer_id: inf.id,
            rank_position: kw.rank,
            previous_rank: prevRank ?? null,
            rank_change: rankChange,
            is_integrated_top3: kw.rank <= 3,
            snapshot_date: snapshotDate,
            crawled_at: new Date().toISOString(),
          });
        }

        // 배치 upsert (100개씩) — rank_position null인 행 제외
        const validRows = upsertRows.filter(r => r.rank_position != null && r.rank_position > 0);
        for (let i = 0; i < validRows.length; i += 100) {
          const batch = validRows.slice(i, i + 100);
          const { error } = await supabase
            .from('keyword_rankings')
            .upsert(batch, { onConflict: 'keyword_id,influencer_id,snapshot_date' });

          if (error) {
            console.error(`[crawl-challenge-ranks] Upsert error:`, error.message);
          } else {
            batchCount += batch.length;
          }
        }

        // 6. influencers 테이블 집계 업데이트 (rank가 유효한 것만)
        const rankedKeywords = keywords.filter(k => k.rank != null && k.rank > 0);
        await supabase
          .from('influencers')
          .update({
            total_keywords: keywords.length,
            best_rank: rankedKeywords.length > 0 ? Math.min(...rankedKeywords.map(k => k.rank)) : null,
            avg_rank: rankedKeywords.length > 0
              ? +(rankedKeywords.reduce((s, k) => s + k.rank, 0) / rankedKeywords.length).toFixed(2)
              : null,
            integrated_top3_count: rankedKeywords.filter(k => k.rank <= 3).length,
            last_crawled_at: new Date().toISOString(),
          })
          .eq('id', inf.id);

        totalProcessed++;
        totalKeywords += batchCount;
        console.log(
          `[crawl-challenge-ranks] ${inf.naver_id}: ${keywords.length} keywords (${batchCount} matched in DB)`,
        );

        await sleep(300);
      } catch (err) {
        console.error(`[crawl-challenge-ranks] Error for "${inf.naver_id}":`, err);
        totalFailed++;
        await sleep(200);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: influencers.length,
      processed_items: totalProcessed,
      failed_items: totalFailed,
    });

    console.log(
      `[Cron] crawl-challenge-ranks done: ${totalProcessed}/${influencers.length} influencers, ${totalKeywords} rankings, ${totalFailed} failed`,
    );

    return NextResponse.json({
      success: true,
      influencers_total: influencers.length,
      influencers_processed: totalProcessed,
      keywords_updated: totalKeywords,
      failed: totalFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-challenge-ranks] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      processed_items: totalProcessed,
      failed_items: totalFailed,
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
