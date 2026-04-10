import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

export const maxDuration = 60;

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PAGE_LIMIT = 50;
const BATCH_SIZE = 15; // Vercel 60초 제한 내 안전한 배치 사이즈
const TODAY = () => new Date().toISOString().slice(0, 10);
const MAX_RUNTIME_MS = 45_000; // 안전 마진 15초

/** keyword를 정규화 (keyword_clean 생성용) */
function cleanKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

interface ParticipatedKeyword {
  id: number; // naver_keyword_id
  name: string;
  categoryId: number;
  rank: number;
  challengeCount: number;
  lastChallengedAt: string;
  thumbnailUrl?: string;
}

/** naverId 형식 검증 (영문/숫자/언더스코어만 허용) */
function isValidNaverId(id: string): boolean {
  return /^[a-zA-Z0-9_]{2,30}$/.test(id);
}

/** 인플루언서 프로필 페이지에서 ownerId 추출 */
async function fetchOwnerId(naverId: string): Promise<string | null> {
  if (!isValidNaverId(naverId)) return null;
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
    const MAX_JSON_SIZE = 100_000;
    for (let i = jsonStart; i < Math.min(jsonStart + MAX_JSON_SIZE, html.length); i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
    if (jsonEnd === -1) return null;

    let state;
    try { state = JSON.parse(html.substring(jsonStart, jsonEnd)); } catch { return null; }
    const ownerId = state?.space?.data?.ownerId;
    return ownerId ? String(ownerId) : null;
  } catch (err) {
    console.error(`[crawl-challenge-ranks] Failed to fetch ownerId for ${naverId}:`, err);
    return null;
  }
}

/** REST API로 인플루언서의 전체 참여 키워드+순위 가져오기 */
async function fetchAllParticipatedKeywords(ownerId: string): Promise<{ keywords: ParticipatedKeyword[]; totalFromApi: number | null }> {
  const results: ParticipatedKeyword[] = [];
  let cursor: string | undefined;
  let totalFromApi: number | null = null;

  for (let page = 0; page < 100; page++) {
    let url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=${PAGE_LIMIT}`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url, {
        headers: { Referer: 'https://in.naver.com/' },
      });
      const json = await res.json();
      const items: ParticipatedKeyword[] = json?.data || [];

      // 첫 페이지에서 API가 알려주는 전체 개수 저장
      if (page === 0 && json?.paging?.total != null) {
        totalFromApi = json.paging.total;
      }

      results.push(...items);

      if (results.length >= 500) {
        console.warn('[crawl-challenge-ranks] Reached max items limit (500)');
        break;
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < PAGE_LIMIT) break;

      await sleep(300);
    } catch (err) {
      console.error(`[crawl-challenge-ranks] API error at page ${page}:`, err);
      break;
    }
  }

  return { keywords: results, totalFromApi };
}

/** DB에 없는 키워드를 keyword_challenges에 생성하고 매핑에 추가 */
async function ensureKeywordsExist(
  supabase: ReturnType<typeof createServiceClient>,
  keywords: ParticipatedKeyword[],
  keywordMap: Map<number, string>,
  categoryFallback: string,
) {
  const missing = keywords.filter(k => !keywordMap.has(k.id));
  if (missing.length === 0) return;

  // 배치로 삽입 (50개씩)
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const rows = batch.map(kw => ({
      keyword: kw.name,
      keyword_clean: cleanKeyword(kw.name),
      category: categoryFallback,
      naver_keyword_id: kw.id,
      participant_count: kw.challengeCount || 0,
      is_active: true,
    }));

    const { data: inserted, error } = await supabase
      .from('keyword_challenges')
      .upsert(rows, { onConflict: 'keyword_clean', ignoreDuplicates: true })
      .select('id, naver_keyword_id');

    if (error) {
      // 에러 시 개별 삽입
      for (const row of rows) {
        try {
          const { data: single, error: singleError } = await supabase
            .from('keyword_challenges')
            .upsert(row, { onConflict: 'keyword_clean', ignoreDuplicates: true })
            .select('id, naver_keyword_id')
            .single();
          if (singleError || !single) {
            console.error('[crawl-challenge-ranks] individual upsert failed:', singleError?.message);
            continue;
          }
          if (single.naver_keyword_id) keywordMap.set(single.naver_keyword_id, single.id);
        } catch { /* skip */ }
      }
    } else {
      inserted?.forEach(kw => {
        if (kw.naver_keyword_id) keywordMap.set(kw.naver_keyword_id, kw.id);
      });
    }
  }

  // keyword_clean으로 존재하지만 naver_keyword_id가 없던 키워드 재매칭
  for (const kw of missing) {
    if (!keywordMap.has(kw.id)) {
      const { data: existing, error: existingError } = await supabase
        .from('keyword_challenges')
        .select('id')
        .eq('keyword_clean', cleanKeyword(kw.name))
        .single();
      if (existingError || !existing) {
        if (existingError) console.error(`[crawl-challenge-ranks] keyword lookup failed for ${kw.name}:`, existingError.message);
        continue;
      }
      keywordMap.set(kw.id, existing.id);
      await supabase
        .from('keyword_challenges')
        .update({ naver_keyword_id: kw.id })
        .eq('id', existing.id);
    }
  }
}

/** 크롤할 인플루언서 목록 조회 — 가입 유저 우선 + 나머지 30명 순환 */
async function getInfluencersToCrawl(supabase: ReturnType<typeof createServiceClient>) {
  const seen = new Set<string>();
  const result: { id: string; naver_id: string; naver_owner_id: string | null; category: string; my_keyword_category: string }[] = [];

  // ── 1단계: 가입 유저가 연결한 인플루언서 (항상 최우선) ──
  const { data: linked } = await supabase
    .from('users')
    .select('linked_influencer_id')
    .not('linked_influencer_id', 'is', null);

  const linkedIds = (linked || []).map(u => u.linked_influencer_id).filter(Boolean);

  if (linkedIds.length > 0) {
    const { data: linkedInfluencers } = await supabase
      .from('influencers')
      .select('id, naver_id, naver_owner_id, category, my_keyword_category')
      .in('id', linkedIds);

    for (const inf of linkedInfluencers || []) {
      seen.add(inf.id);
      result.push(inf);
    }
  }

  // ── 2단계: 나머지 인플루언서 순환 크롤 (오래된 순 30명) ──
  const { data: others } = await supabase
    .from('influencers')
    .select('id, naver_id, naver_owner_id, category, my_keyword_category')
    .order('last_crawled_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE + linkedIds.length); // 연결된 유저가 포함될 수 있으므로 여유분

  for (const inf of others || []) {
    if (!seen.has(inf.id) && result.length < linkedIds.length + BATCH_SIZE) {
      seen.add(inf.id);
      result.push(inf);
    }
  }

  console.log(`[crawl-challenge-ranks] Target: ${linkedIds.length} linked + ${result.length - linkedIds.length} others = ${result.length} total`);
  return result;
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
    let influencers: { id: string; naver_id: string; naver_owner_id: string | null; category: string; my_keyword_category: string }[];

    if (targetNaverId) {
      const { data } = await supabase
        .from('influencers')
        .select('id, naver_id, naver_owner_id, category, my_keyword_category')
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

    const startTime = Date.now();
    for (const inf of influencers) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[crawl-challenge-ranks] Time limit reached, stopping early`);
        break;
      }
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
        const { keywords, totalFromApi } = await fetchAllParticipatedKeywords(ownerId);
        if (keywords.length === 0) {
          console.log(`[crawl-challenge-ranks] No keywords for ${inf.naver_id}`);
          totalFailed++;
          continue;
        }

        // 3. naver_keyword_id로 keyword_challenges 매칭
        const naverKeywordIds = keywords.map(k => k.id);

        // 배치로 조회 (500개 단위)
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

        // 3-1. DB에 없는 키워드 → keyword_challenges에 생성
        const categoryFallback = inf.my_keyword_category || inf.category || '';
        await ensureKeywordsExist(supabase, keywords, keywordMap, categoryFallback);

        // 3-2. influencer_keywords 연결
        const linkRows: { influencer_id: string; keyword_id: string }[] = [];
        for (const kw of keywords) {
          const kwId = keywordMap.get(kw.id);
          if (kwId) linkRows.push({ influencer_id: inf.id, keyword_id: kwId });
        }
        for (let i = 0; i < linkRows.length; i += 100) {
          const batch = linkRows.slice(i, i + 100);
          await supabase
            .from('influencer_keywords')
            .upsert(batch, { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true });
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

        // 마지막 참여일: 네이버 API의 lastChallengedAt 중 가장 최근 날짜 사용
        // 네이버 API는 KST 시간을 타임존 없이 반환하므로 +09:00 명시
        const challengeDates = keywords
          .map(k => k.lastChallengedAt)
          .filter(Boolean)
          .map(d => new Date(d + '+09:00').getTime())
          .filter(t => !isNaN(t));
        const lastChallengedAt = challengeDates.length > 0
          ? new Date(Math.max(...challengeDates)).toISOString()
          : null;

        const top1 = rankedKeywords.filter(k => k.rank === 1).length;
        const top2 = rankedKeywords.filter(k => k.rank === 2).length;
        const top3 = rankedKeywords.filter(k => k.rank === 3).length;
        // 실제 크롤한 키워드 수를 기준으로 사용 (paging.total은 부정확할 수 있음)
        // totalFromApi가 실제보다 크면 top3_ratio가 왜곡됨
        const totalKw = keywords.length;

        const updateData: Record<string, unknown> = {
          total_keywords: totalKw,
          best_rank: rankedKeywords.length > 0 ? Math.min(...rankedKeywords.map(k => k.rank)) : null,
          avg_rank: rankedKeywords.length > 0
            ? +(rankedKeywords.reduce((s, k) => s + k.rank, 0) / rankedKeywords.length).toFixed(2)
            : null,
          integrated_top3_count: top1 + top2 + top3,
          top1_count: top1,
          top2_count: top2,
          top3_count: top3,
          top3_ratio: totalKw > 0 ? +((top1 + top2 + top3) / totalKw).toFixed(4) : 0,
        };

        // 실제 참여일이 있을 때만 업데이트
        if (lastChallengedAt) {
          updateData.last_crawled_at = lastChallengedAt;
          updateData.last_challenged_at = lastChallengedAt;
        }

        await supabase
          .from('influencers')
          .update(updateData)
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
