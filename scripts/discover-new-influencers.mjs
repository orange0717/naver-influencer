#!/usr/bin/env node
/**
 * 신규 인플루언서 자동 발굴 스크립트
 *
 * 전략:
 *   1. keyword_challenges 에서 상위 N개 키워드를 선택
 *   2. 각 키워드의 feed API (discover/collection/searched) 로 참가자 목록 수집
 *   3. influencers 테이블에 없는 naver_id 만 upsert (ignoreDuplicates=true)
 *
 * 기본 동작: dry-run. --apply 를 주어야 DB 에 저장.
 *
 * 사용법:
 *   node scripts/discover-new-influencers.mjs                         # dry-run
 *   node scripts/discover-new-influencers.mjs --apply --top 200       # 상위 200 키워드
 *   node scripts/discover-new-influencers.mjs --apply --keyword-id X  # 특정 키워드만
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  FEED_API_BASE: 'https://gw.in.naver.com/feed/query/v1',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  REFERER: 'https://in.naver.com/',
  DELAY_BETWEEN_KEYWORDS: 700,
  DELAY_ON_ERROR: 3000,
  MAX_RETRIES: 3,
  PAGES_PER_KEYWORD: 2,
  REQUEST_TIMEOUT_MS: 15000,
  PROGRESS_FILE: resolve(__dirname, '.discover-new-influencers-progress.json'),
};

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 결과가 0인 이유(차단 403 / 레이트리밋 429 / 진짜 무결과 200)를 사후에 구분하기 위한 집계.
// 응답 본문만 보면 셋이 똑같이 빈 결과로 보인다.
const httpStatusCounts = new Map();
const bumpStatus = (k) => httpStatusCounts.set(k, (httpStatusCounts.get(k) || 0) + 1);
function formatStatusCounts() {
  return [...httpStatusCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ') || '없음';
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: CONFIG.REFERER,
        },
      });
      clearTimeout(to);
      if (res.status === 429) {
        bumpStatus(429);
        const wait = 4000 * Math.pow(2, attempt);
        console.log(`\n  429 Rate Limited — ${wait}ms 대기`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt < CONFIG.MAX_RETRIES) {
        bumpStatus(res.status);
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      bumpStatus(res.status);
      return res;
    } catch (err) {
      clearTimeout(to);
      if (attempt < CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      bumpStatus(err.name === 'AbortError' ? 'timeout' : 'neterr');
      throw err;
    }
  }
}

async function fetchInfluencersByKeyword(keywordId) {
  const out = [];
  const seen = new Set();
  let cursor;

  for (let page = 0; page < CONFIG.PAGES_PER_KEYWORD; page++) {
    let url = `${CONFIG.FEED_API_BASE}/discover/collection/searched?keywordId=${keywordId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url);
      if (!res?.ok) break;
      const json = await res.json();
      const items = json?.data || [];
      for (const it of items) {
        const c = it?.creator;
        if (!c?.urlId || seen.has(c.urlId)) continue;
        seen.add(c.urlId);
        out.push({
          naver_id: c.urlId,
          display_name: c.nickname || '',
          profile_url: `https://in.naver.com/${c.urlId}`,
          image_url: c.imageUrl || '',
          introduction: c.introduction || '',
          subscriber_count: c.subscriberCount || 0,
          total_follower_count: c.totalFollowerCount || 0,
          my_keyword_category: c.myKeywordCategory || '',
          my_keyword: c.myKeyword || '',
          category_my_type: c.categoryMyType || '',
          category: c.myKeywordCategory || '',
          first_seen_at: new Date().toISOString(),
          last_crawled_at: new Date().toISOString(),
        });
      }
      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch {
      break;
    }
  }
  return out;
}

// ─── CLI ───

const args = process.argv.slice(2);
const hasArg = (n) => args.includes(n);
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const isApply = hasArg('--apply');
const topKeywords = getArg('--top') ? parseInt(getArg('--top')) : 200;
const onlyKeywordId = getArg('--keyword-id');
const isResume = hasArg('--resume');

function loadProgress() {
  if (isResume && existsSync(CONFIG.PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8')); } catch {}
  }
  return { processedKeywordIds: [] };
}
function saveProgress(p) { writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function main() {
  console.log('=== 신규 인플루언서 발굴 ===');
  console.log(`모드: ${isApply ? 'APPLY (DB 저장)' : 'DRY-RUN (저장 안 함)'}, top=${topKeywords}${onlyKeywordId ? `, keyword-id=${onlyKeywordId}` : ''}`);

  // 기존 인플루언서 naver_id 셋 (중복 체크용)
  console.log('기존 인플루언서 목록 로드 중...');
  const existingIds = new Set();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('influencers')
      .select('naver_id')
      .range(offset, offset + 999);
    if (error) { console.error('조회 실패:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const row of data) { if (row.naver_id) existingIds.add(row.naver_id); }
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`기존 인플루언서: ${existingIds.size}명`);

  // 키워드 조회 (Naver feed API 는 naver_keyword_id 를 기대함)
  // participant_count 상위만 반복 조회하면 이미 포화된 인기 키워드만 계속 훑게 되어
  // 115,486개 풀 중 대부분(장기간 미조회)이 영영 발굴 대상에서 빠지는 사각지대가 생김.
  // → 20%는 인기 키워드(활발한 챌린지 갱신), 80%는 influencer_crawled_at 오래된/미조회 키워드로 로테이션.
  let keywords = [];
  if (onlyKeywordId) {
    const { data } = await supabase.from('keyword_challenges')
      .select('id, keyword, participant_count, naver_keyword_id')
      .eq('id', onlyKeywordId)
      .limit(1).maybeSingle();
    if (data) keywords = [data];
  } else {
    const tier1Size = Math.max(1, Math.floor(topKeywords * 0.2));
    const tier2Size = topKeywords - tier1Size;

    // PostgREST 는 응답을 max-rows(1000행)로 자르기 때문에 .limit(2800) 을 줘도 1000개만 온다.
    // 2026-08-22 --top 3500 실행이 조용히 1700개(700+1000)만 돌았던 원인 — 에러도 경고도 없다.
    // 그래서 1000행씩 range 로 끊어 가져온다. 동점(특히 influencer_crawled_at NULL 다수)에서
    // 페이지 경계가 흔들려 중복/누락이 생기지 않도록 id 를 2차 정렬키로 고정한다.
    async function fetchKeywordTier(column, ascending, size) {
      const rows = [];
      const PAGE = 1000;
      while (rows.length < size) {
        const from = rows.length;
        const to = Math.min(from + PAGE, size) - 1;
        const { data, error } = await supabase.from('keyword_challenges')
          .select('id, keyword, participant_count, naver_keyword_id')
          .eq('is_active', true)
          .not('naver_keyword_id', 'is', null)
          .order(column, { ascending, nullsFirst: ascending })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) { console.error(`키워드 조회 실패(${column}):`, error.message); process.exit(1); }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < to - from + 1) break;
      }
      return rows;
    }

    const tier1 = await fetchKeywordTier('participant_count', false, tier1Size);
    const tier2 = await fetchKeywordTier('influencer_crawled_at', true, tier2Size);

    const seen = new Set();
    keywords = [];
    for (const row of [...(tier1 || []), ...(tier2 || [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      keywords.push(row);
    }
  }

  console.log(`대상 키워드: ${keywords.length}개 (인기 상위 + 장기 미조회 로테이션 혼합)`);

  const progress = loadProgress();
  const processed = new Set(progress.processedKeywordIds || []);
  let discovered = 0;
  let newCount = 0;
  let skipped = 0;
  let emptyCount = 0;
  let attempted = 0;
  let cancelled = false;
  process.on('SIGINT', () => { console.log('\n중단 요청. 진행 저장 후 종료'); cancelled = true; });

  for (let i = 0; i < keywords.length; i++) {
    if (cancelled) break;
    const kw = keywords[i];
    if (processed.has(kw.id)) { skipped++; continue; }

    const items = await fetchInfluencersByKeyword(kw.naver_keyword_id);
    attempted++;
    if (items.length === 0) emptyCount++;
    discovered += items.length;
    const fresh = items.filter(x => !existingIds.has(x.naver_id));
    newCount += fresh.length;

    if (fresh.length > 0 && isApply) {
      const { error } = await supabase.from('influencers').upsert(fresh, {
        onConflict: 'naver_id',
        ignoreDuplicates: true,
      });
      if (error) {
        console.error(`\n  DB 오류 [${kw.keyword}]:`, error.message);
      } else {
        for (const f of fresh) existingIds.add(f.naver_id);
      }
    }

    processed.add(kw.id);
    if (isApply) {
      await supabase.from('keyword_challenges')
        .update({ influencer_crawled_at: new Date().toISOString() })
        .eq('id', kw.id);
    }
    process.stdout.write(`\r  [${i + 1}/${keywords.length}] "${kw.keyword}" 수집 ${items.length}명 / 신규 ${fresh.length}명 (누적 신규 ${newCount})        `);

    if ((i + 1) % 10 === 0) {
      progress.processedKeywordIds = Array.from(processed);
      saveProgress(progress);
    }
    await sleep(CONFIG.DELAY_BETWEEN_KEYWORDS);
  }

  progress.processedKeywordIds = Array.from(processed);
  saveProgress(progress);

  console.log('\n\n=== 완료 ===');
  console.log(`  조회 키워드: ${keywords.length}개`);
  console.log(`  API 수집 총: ${discovered}명`);
  console.log(`  신규 발굴(기존 미등록): ${newCount}명`);
  console.log(`  skip(이미 처리): ${skipped}개`);
  if (!isApply) console.log('\n*** dry-run — 실제 저장하려면 --apply 추가 ***');

  // 네이버가 러너 IP를 차단하면 모든 키워드가 조용히 0명을 반환해 워크플로가 success로 끝난다
  // (2026-08-22 discover-via-search 실측: 3,462개 중 3,461개가 0건). 정상일의 0건 비율은
  // 33~44%이므로 90%를 넘으면 수집이 아니라 차단으로 보고 실패시킨다.
  const emptyRatio = attempted > 0 ? emptyCount / attempted : 0;
  console.log(`  0건 키워드: ${emptyCount}/${attempted} (${(emptyRatio * 100).toFixed(1)}%)`);
  console.log(`  HTTP 응답: ${formatStatusCounts()}`);
  if (attempted >= 50 && emptyRatio >= 0.9) {
    console.error(`::error ::수집 결과 0건 비율 ${(emptyRatio * 100).toFixed(1)}% — HTTP 응답 ${formatStatusCounts()}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
