import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  createCrawlJob,
  fetchWithRetry,
  releaseCronLock,
  sleep,
  tryAcquireCronLock,
  updateCrawlJob,
  verifyCronSecret,
} from '@/lib/crawler';
import { dailyCrawlQueueOrFilter } from '@/lib/crawl-queue';

export const maxDuration = 300;

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PAGE_LIMIT = 50;
// 5분마다 실행 → 288회/일. 전체 활성 ~2만 명을 24h 안 1회 순환 목표(회당 처리량은 batch·타임아웃에 따름).
// 중복 실행은 cron_locks로 막고, 실행 시간 제한에 닿으면 다음 회차가 이어받는다.
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 8;
const MAX_BATCH_SIZE = 1500;
const MAX_CONCURRENCY = 15;
const CRON_LOCK_KEY = 'cron:crawl-challenge-ranks';
const CRON_LOCK_TTL_SECONDS = 330;
const TODAY = () => new Date().toISOString().slice(0, 10);
const MAX_RUNTIME_MS = 285_000; // 300초 중 안전 마진 15초

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

/** 쿼리/표시용 @ 접두사 제거 후 검증 */
function normalizeNaverIdParam(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^@/, '');
  return isValidNaverId(s) ? s : null;
}

/** ?naver_ids=a,b,c (순서 유지, 중복 제거, 최대 MAX개) */
function parseNaverIdsList(param: string | null, max = 40): string[] {
  if (!param?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of param.split(',')) {
    const id = normalizeNaverIdParam(part);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
      if (out.length >= max) break;
    }
  }
  return out;
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

/** REST API로 인플루언서의 전체 참여 키워드+순위 가져오기.
 *  failed=true는 "0개 참여"가 아니라 "API 호출 자체가 실패해 확인 못함"을 뜻한다 —
 *  호출부가 이 둘을 구분해야 API 일시 장애로 total_keywords/top1-3_count가 0으로
 *  잘못 덮어써지는 사고를 막을 수 있다 (해당 인플루언서가 크롤 큐에서 영구 이탈할 위험).
 */
async function fetchAllParticipatedKeywords(
  ownerId: string,
): Promise<{ keywords: ParticipatedKeyword[]; totalFromApi: number | null; failed: boolean }> {
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

      if (results.length >= 2000) {
        console.warn('[crawl-challenge-ranks] Reached max items limit (2000)');
        break;
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < PAGE_LIMIT) break;

      // (2026-07-30) 300ms→120ms: 활동 많은 인플루언서(최대 40페이지)가 페이지네이션만으로
      // 17~18초씩 걸려 concurrency=6 웨이브가 300초 함수 제한을 넘기는 주 원인이었음.
      // fetchWithRetry의 429 백오프(4s×2^n)가 있어 레이트리밋 위험은 안전망으로 남아있음.
      await sleep(120);
    } catch (err) {
      console.error(`[crawl-challenge-ranks] API error at page ${page}:`, err);
      // 0페이지부터 실패 = 결과를 전혀 확인 못함(진짜 0개와 구분 필요)
      return { keywords: results, totalFromApi, failed: page === 0 };
    }
  }

  return { keywords: results, totalFromApi, failed: false };
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

  // 배치로 삽입 (50개씩) — 청크 간 순차 대기가 헤비 인플루언서(참여 키워드 최대 2000개 = 40청크)에서
  // 유의미한 지연을 만들어 병렬 처리 (2026-07-30, crawl_jobs 실측: 큐 앞쪽 헤비 계정 클러스터가
  // 300초 함수 제한을 넘기는 주 원인으로 확인됨)
  const chunks: (typeof missing)[] = [];
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50));

  await Promise.all(chunks.map(async batch => {
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
      // 에러 시 개별 삽입 (이 경로는 드물게만 타므로 순차 유지)
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
  }));

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

/** id 기준 샤드 (0 … shards-1). 동일 id는 항상 같은 샤드. */
function crawlShardIndex(id: string, shards: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return ((h % shards) + shards) % shards;
}

/** 크롤할 인플루언서 목록 조회.
 *
 * 전체 인플루언서 풀을 오래된 순서로 순환한다. total_keywords=0도 다음 크롤 때
 * 참여 키워드가 생길 수 있으므로 큐에서 제외하면 안 된다. 수동 활동중단 또는
 * import에서 비활성 처리된 행만 제외한다.
 *
 * shard/shards 가 있으면 큐를 둘로 나눠 Vercel 크론 2개가 동시에 다른 인플을 처리한다.
 */
async function getInfluencersToCrawl(
  supabase: ReturnType<typeof createServiceClient>,
  batchSize: number,
  shard?: number,
  shards?: number,
) {
  const useShard = shards != null && shards > 1 && shard != null && shard >= 0 && shard < shards;
  const fetchLimit = useShard
    ? Math.min(batchSize * shards * 4, MAX_BATCH_SIZE * 3)
    : batchSize;

  const { data, error } = await supabase
    .from('influencers')
    .select('id, naver_id, naver_owner_id, category, my_keyword_category')
    .eq('is_active', true)
    .neq('stopped_manual', true)
    .or(dailyCrawlQueueOrFilter())
    .order('last_crawled_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(fetchLimit);

  if (error) {
    console.error('[crawl-challenge-ranks] target query failed:', error.message);
    return [];
  }

  let rows = data || [];
  if (useShard) {
    rows = rows.filter(r => crawlShardIndex(r.id, shards!) === shard!).slice(0, batchSize);
  }

  const shardLabel = useShard ? ` shard=${shard}/${shards}` : '';
  console.log(`[crawl-challenge-ranks] Target: ${rows.length} influencers (oldest first${shardLabel})`);
  return rows;
}

type InfluencerCrawlRow = {
  id: string;
  naver_id: string;
  naver_owner_id: string | null;
  category: string;
  my_keyword_category: string;
};

/** naver_id 목록 순서를 유지하며 행 조회 (수동 우선 크롤용) */
async function fetchInfluencersByNaverIds(
  supabase: ReturnType<typeof createServiceClient>,
  naverIds: string[],
): Promise<InfluencerCrawlRow[]> {
  if (naverIds.length === 0) return [];
  const { data, error } = await supabase
    .from('influencers')
    .select('id, naver_id, naver_owner_id, category, my_keyword_category')
    .in('naver_id', naverIds);

  if (error) {
    console.error('[crawl-challenge-ranks] explicit naver_ids query failed:', error.message);
    return [];
  }

  const byNaver = new Map((data || []).map(r => [r.naver_id, r]));
  const ordered: InfluencerCrawlRow[] = [];
  for (const id of naverIds) {
    const row = byNaver.get(id);
    if (row) ordered.push(row);
    else console.warn(`[crawl-challenge-ranks] No influencer row for naver_id=${id}`);
  }
  return ordered;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const naverIdsFromList = parseNaverIdsList(request.nextUrl.searchParams.get('naver_ids'));
  const singleFromParam = normalizeNaverIdParam(request.nextUrl.searchParams.get('naver_id'));
  const explicitNaverIds =
    naverIdsFromList.length > 0 ? naverIdsFromList : singleFromParam ? [singleFromParam] : [];

  const shardParam = request.nextUrl.searchParams.get('shard');
  const shardsParam = request.nextUrl.searchParams.get('shards');
  const shards =
    shardsParam != null && Number.isFinite(Number(shardsParam)) && Number(shardsParam) > 1
      ? Math.min(Math.floor(Number(shardsParam)), 8)
      : undefined;
  const shard =
    shardParam != null && shards != null && Number.isFinite(Number(shardParam))
      ? Math.floor(Number(shardParam))
      : undefined;

  const lockKey =
    explicitNaverIds.length === 1
      ? `${CRON_LOCK_KEY}:${explicitNaverIds[0]}`
      : explicitNaverIds.length > 1
        ? `${CRON_LOCK_KEY}:multi-explicit`
        : shards != null && shard != null
          ? `${CRON_LOCK_KEY}:shard-${shard}-${shards}`
          : CRON_LOCK_KEY;
  const lockAcquired = await tryAcquireCronLock(lockKey, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    console.log(`[crawl-challenge-ranks] Previous run is still active; skipping (${lockKey})`);
    return NextResponse.json({ success: true, skipped: true, reason: 'lock_active' });
  }

  const jobId = await createCrawlJob('crawl-challenge-ranks');
  const supabase = createServiceClient();
  const snapshotDate = TODAY();
  let totalProcessed = 0;
  let totalKeywords = 0;
  let totalFailed = 0;

  // ?batch=N&concurrency=N 파라미터로 새벽 증량 실행 가능 (상한 존재)
  const batchParam = Number(request.nextUrl.searchParams.get('batch'));
  const concurrencyParam = Number(request.nextUrl.searchParams.get('concurrency'));
  const BATCH_SIZE = Number.isFinite(batchParam) && batchParam > 0
    ? Math.min(batchParam, MAX_BATCH_SIZE)
    : DEFAULT_BATCH_SIZE;
  const CONCURRENCY = Number.isFinite(concurrencyParam) && concurrencyParam > 0
    ? Math.min(concurrencyParam, MAX_CONCURRENCY)
    : DEFAULT_CONCURRENCY;

  const shardLog =
    shards != null && shard != null && explicitNaverIds.length === 0 ? `, shard=${shard}/${shards}` : '';
  console.log(
    `[Cron] crawl-challenge-ranks started at ${new Date().toISOString()} (batch=${BATCH_SIZE}, concurrency=${CONCURRENCY}${shardLog})`,
  );

  try {
    let influencers: InfluencerCrawlRow[];

    if (explicitNaverIds.length > 0) {
      influencers = await fetchInfluencersByNaverIds(supabase, explicitNaverIds);
    } else {
      influencers = await getInfluencersToCrawl(supabase, BATCH_SIZE, shard, shards);
    }

    if (influencers.length === 0) {
      console.log('[crawl-challenge-ranks] No influencers to crawl.');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, message: 'No influencers', processed: 0 });
    }

    console.log(`[crawl-challenge-ranks] Processing ${influencers.length} influencers (concurrency=${CONCURRENCY})`);

    const startTime = Date.now();

    async function processInfluencer(inf: typeof influencers[number]): Promise<{ ok: boolean; count: number }> {
      // 1. ownerId 확보
      let ownerId = inf.naver_owner_id;
      if (!ownerId) {
        ownerId = await fetchOwnerId(inf.naver_id);
        if (!ownerId) {
          console.log(`[crawl-challenge-ranks] Cannot get ownerId for ${inf.naver_id}`);
          await supabase
            .from('influencers')
            .update({ last_crawled_at: new Date().toISOString() })
            .eq('id', inf.id);
          return { ok: true, count: 0 };
        }
        await supabase.from('influencers').update({ naver_owner_id: ownerId }).eq('id', inf.id);
      }

      // 2. 전체 참여 키워드+순위 가져오기
      const { keywords, failed: fetchFailed } = await fetchAllParticipatedKeywords(ownerId);
      if (fetchFailed) {
        // API 호출 자체가 실패한 것 — "0개 참여"가 아니다. total_keywords/top1-3_count를
        // 0으로 덮어쓰지 않고 last_crawled_at도 건드리지 않아, 다음 순환 때 최우선으로
        // 재시도되도록 한다 (여기서 last_crawled_at을 갱신하면 실제로는 아무것도 확인
        // 못했는데 "방금 확인함"으로 큐에서 밀려나 통계가 영구히 굳어버릴 수 있음).
        console.warn(`[crawl-challenge-ranks] participated-keywords API 실패, 재시도 보류: ${inf.naver_id}`);
        return { ok: false, count: 0 };
      }
      if (keywords.length === 0) {
        console.log(`[crawl-challenge-ranks] No keywords for ${inf.naver_id}`);
        await supabase
          .from('influencers')
          .update({
            total_keywords: 0,
            best_rank: null,
            avg_rank: null,
            integrated_top3_count: 0,
            top1_count: 0,
            top2_count: 0,
            top3_count: 0,
            top3_ratio: 0,
            last_crawled_at: new Date().toISOString(),
          })
          .eq('id', inf.id);
        return { ok: true, count: 0 };
      }

      // 3. naver_keyword_id로 keyword_challenges 매칭
      const naverKeywordIds = keywords.map(k => k.id);
      const keywordMap = new Map<number, string>();
      const idChunks: number[][] = [];
      for (let i = 0; i < naverKeywordIds.length; i += 500) idChunks.push(naverKeywordIds.slice(i, i + 500));
      await Promise.all(idChunks.map(async batch => {
        const { data: dbKeywords } = await supabase
          .from('keyword_challenges')
          .select('id, naver_keyword_id')
          .in('naver_keyword_id', batch);
        dbKeywords?.forEach(kw => { if (kw.naver_keyword_id) keywordMap.set(kw.naver_keyword_id, kw.id); });
      }));

      const categoryFallback = inf.my_keyword_category || inf.category || '';
      await ensureKeywordsExist(supabase, keywords, keywordMap, categoryFallback);

      const linkRows: { influencer_id: string; keyword_id: string }[] = [];
      for (const kw of keywords) {
        const kwId = keywordMap.get(kw.id);
        if (kwId) linkRows.push({ influencer_id: inf.id, keyword_id: kwId });
      }
      const linkChunks: (typeof linkRows)[] = [];
      for (let i = 0; i < linkRows.length; i += 100) linkChunks.push(linkRows.slice(i, i + 100));
      await Promise.all(linkChunks.map(batch =>
        supabase.from('influencer_keywords').upsert(batch, { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true }),
      ));

      // 4. 직전 스냅샷 순위 조회 (rank_change 계산용)
      // 기존: snapshot_date === "어제" 한 날만 조회 → 크롤이 하루 비거나 부분 적재되면
      // 전 키워드가 previous_rank 없음·rank_change 0으로 덮여 상승/하락 UI가 사라짐.
      // 개선: 오늘 스냅샷 이전 중 가장 최근 일자의 순위를 키워드별로 사용 (최근 45일).
      const prevRankMap = new Map<string, number>();
      const since = new Date();
      since.setDate(since.getDate() - 45);
      const sinceStr = since.toISOString().slice(0, 10);
      const { data: priorRows } = await supabase
        .from('keyword_rankings')
        .select('keyword_id, rank_position, snapshot_date')
        .eq('influencer_id', inf.id)
        .lt('snapshot_date', snapshotDate)
        .gte('snapshot_date', sinceStr)
        .order('snapshot_date', { ascending: false });
      for (const row of priorRows || []) {
        if (!prevRankMap.has(row.keyword_id)) {
          prevRankMap.set(row.keyword_id, row.rank_position);
        }
      }

      // 5. keyword_rankings UPSERT (배치)
      let batchCount = 0;
      const upsertRows: Array<{
        keyword_id: string; influencer_id: string; rank_position: number;
        previous_rank: number | null; rank_change: number; is_integrated_top3: boolean;
        snapshot_date: string; crawled_at: string;
      }> = [];

      for (const kw of keywords) {
        const keywordId = keywordMap.get(kw.id);
        if (!keywordId) continue;
        if (!kw.rank && kw.rank !== 0) continue;
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

      const validRows = upsertRows.filter(r => r.rank_position != null && r.rank_position > 0);

      if (validRows.length > 0) {
        // 1차: atomic RPC — 단일 트랜잭션, 도중 실패 시 전체 rollback
        // (migration-085-atomic-ranking-upsert.sql, migration-104에서 statement_timeout 추가)
        const { error: rpcError } = await supabase.rpc(
          'upsert_keyword_rankings_atomic',
          { p_rows: validRows }
        );
        if (!rpcError) {
          batchCount += validRows.length;
        } else {
          // RPC 미배포 또는 호출 실패 → 기존 batch upsert 로 폴백
          // (이 경로는 부분 적재 가능, 마이그레이션 적용 후엔 거의 타지 않음)
          console.warn(
            `[crawl-challenge-ranks] atomic RPC failed for ${inf.naver_id}, ` +
            `falling back to batch upsert: ${rpcError.message}`
          );
          const rankChunks: (typeof validRows)[] = [];
          for (let i = 0; i < validRows.length; i += 100) rankChunks.push(validRows.slice(i, i + 100));
          const chunkResults = await Promise.all(rankChunks.map(async batch => {
            const { error } = await supabase
              .from('keyword_rankings')
              .upsert(batch, { onConflict: 'keyword_id,influencer_id,snapshot_date' });
            if (error) { console.error(`[crawl-challenge-ranks] Upsert error:`, error.message); return 0; }
            return batch.length;
          }));
          batchCount += chunkResults.reduce((s, n) => s + n, 0);
        }
      }

      // keyword_rankings 적재가 (부분이라도) 실패하면 last_crawled_at을 갱신하지 않는다.
      // 예전엔 이 실패와 무관하게 last_crawled_at/집계값이 항상 "방금 크롤됨"으로 덮어써져서,
      // 실제 순위 원자료는 며칠째 그대로인데 대시보드 상단 값만 최신처럼 보이는 문제가 있었음.
      // last_crawled_at을 건드리지 않으면 순환 크롤 큐(oldest first)에서 계속 우선순위로 남는다.
      if (validRows.length > 0 && batchCount < validRows.length) {
        console.error(
          `[crawl-challenge-ranks] ${inf.naver_id}: keyword_rankings 적재 실패 ` +
          `(${batchCount}/${validRows.length}) — last_crawled_at 갱신 보류`
        );
        return { ok: false, count: batchCount };
      }

      // 6. influencers 테이블 집계 업데이트
      const rankedKeywords = keywords.filter(k => k.rank != null && k.rank > 0);
      const challengeDates = keywords.map(k => k.lastChallengedAt).filter(Boolean)
        .map(d => new Date(d + '+09:00').getTime()).filter(t => !isNaN(t));
      const lastChallengedAt = challengeDates.length > 0 ? new Date(Math.max(...challengeDates)).toISOString() : null;

      const top1 = rankedKeywords.filter(k => k.rank === 1).length;
      const top2 = rankedKeywords.filter(k => k.rank === 2).length;
      const top3 = rankedKeywords.filter(k => k.rank === 3).length;
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

      // last_crawled_at은 항상 현재 크롤링 시각 (순환 크롤 우선순위 산정용).
      // 이전 코드는 lastChallengedAt을 last_crawled_at에 덮어써서, 챌린지 활동이 활발한
      // 인플루언서일수록 last_crawled_at이 미래 날짜처럼 갱신되어 재크롤 큐에서 밀려나는 버그가 있었음.
      updateData.last_crawled_at = new Date().toISOString();
      if (lastChallengedAt) {
        updateData.last_challenged_at = lastChallengedAt;
      }

      await supabase.from('influencers').update(updateData).eq('id', inf.id);

      console.log(`[crawl-challenge-ranks] ${inf.naver_id}: ${keywords.length} keywords (${batchCount} matched in DB)`);
      return { ok: true, count: batchCount };
    }

    // CONCURRENCY 만큼 병렬 처리 (웨이브)
    for (let i = 0; i < influencers.length; i += CONCURRENCY) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[crawl-challenge-ranks] Time limit reached, stopping early at ${i}/${influencers.length}`);
        break;
      }
      const wave = influencers.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(wave.map(inf =>
        processInfluencer(inf).catch(err => {
          console.error(`[crawl-challenge-ranks] Error for "${inf.naver_id}":`, err);
          return { ok: false, count: 0 } as const;
        }),
      ));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          totalProcessed++;
          totalKeywords += r.value.count;
        } else {
          totalFailed++;
        }
      }
      await sleep(80);
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
  } finally {
    await releaseCronLock(lockKey);
  }
}
