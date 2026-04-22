#!/usr/bin/env node
/**
 * keyword_rankings.content_count 백필 크롤러
 *
 * 동작:
 *   1) 활동 인플루언서 전체 또는 특정 1명을 순회
 *   2) participated-keywords API 호출 (페이지네이션)
 *   3) 각 키워드의 challengeCount → keyword_rankings.content_count 업데이트
 *
 * 매칭 키:
 *   - keyword_challenges.naver_keyword_id 로 keyword_id 매칭
 *   - keyword_rankings (influencer_id, keyword_id) 의 가장 최근 snapshot_date 행 갱신
 *
 * 사용:
 *   node scripts/crawl-content-counts.mjs --display-name 오렌지도서관   # 1명 테스트
 *   node scripts/crawl-content-counts.mjs --naver-id <id>               # 1명 테스트
 *   node scripts/crawl-content-counts.mjs --limit 50                    # 상위 50명만
 *   node scripts/crawl-content-counts.mjs --resume                      # 중단 지점 재개
 *   node scripts/crawl-content-counts.mjs --dry-run                     # 저장 없이 출력만
 *   node scripts/crawl-content-counts.mjs                                # 전체 활동 인플루언서
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DELAY_MS = 300;
const PROGRESS_FILE = resolve(__dirname, '.content-count-progress.json');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const has = (k) => args.includes(k);
const isDryRun = has('--dry-run');
const isResume = has('--resume');
const limitCount = parseInt(arg('--limit') || '999999', 10);
const filterDisplayName = arg('--display-name');
const filterNaverId = arg('--naver-id');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://in.naver.com/',
        },
      });
      clearTimeout(t);
      if (res.status === 429) {
        await sleep(4000 * Math.pow(2, attempt));
        continue;
      }
      if (res.status >= 500 && attempt < retries) {
        await sleep(3000);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
}

async function fetchParticipatedKeywords(ownerId) {
  const results = [];
  let cursor;
  for (let page = 0; page < 100; page++) {
    let url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;
    try {
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const items = json?.data || [];
      results.push(...items);
      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
      await sleep(300);
    } catch {
      break;
    }
  }
  return results;
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')); } catch {}
  }
  return { lastIndex: 0 };
}

function saveProgress(p) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

async function loadKeywordMap() {
  // naver_keyword_id → keyword_challenges.id
  const map = new Map();
  let off = 0;
  while (true) {
    const { data } = await supabase
      .from('keyword_challenges')
      .select('id, naver_keyword_id')
      .not('naver_keyword_id', 'is', null)
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    data.forEach(r => map.set(String(r.naver_keyword_id), r.id));
    off += data.length;
    if (data.length < 1000) break;
  }
  return map;
}

async function loadInfluencers() {
  if (filterDisplayName) {
    const { data } = await supabase
      .from('influencers')
      .select('id, display_name, naver_id, naver_owner_id')
      .eq('display_name', filterDisplayName);
    return data || [];
  }
  if (filterNaverId) {
    const { data } = await supabase
      .from('influencers')
      .select('id, display_name, naver_id, naver_owner_id')
      .eq('naver_id', filterNaverId);
    return data || [];
  }
  // 활동 인플루언서 (naver_owner_id 있고 + integrated_top3_count > 0)
  const result = [];
  let off = 0;
  while (true) {
    const { data } = await supabase
      .from('influencers')
      .select('id, display_name, naver_id, naver_owner_id')
      .not('naver_owner_id', 'is', null)
      .gt('integrated_top3_count', 0)
      .order('subscriber_count', { ascending: false, nullsFirst: false })
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    result.push(...data);
    off += data.length;
    if (data.length < 1000) break;
  }
  return result;
}

async function processInfluencer(inf, keywordMap) {
  if (!inf.naver_owner_id) return { ok: 0, skip: 0, miss: 0 };
  const keywords = await fetchParticipatedKeywords(inf.naver_owner_id);
  if (keywords.length === 0) return { ok: 0, skip: 0, miss: 0 };

  // 가장 최근 ranking 행을 찾기 위해 인플루언서의 모든 (keyword_id, snapshot_date) 로드
  // 효율 위해 한 번에 가져옴
  const { data: existingRows } = await supabase
    .from('keyword_rankings')
    .select('id, keyword_id, snapshot_date, content_count')
    .eq('influencer_id', inf.id);

  // (keyword_id) → 가장 최근 row id
  const latestByKeyword = new Map();
  for (const row of existingRows || []) {
    const prev = latestByKeyword.get(row.keyword_id);
    if (!prev || row.snapshot_date > prev.snapshot_date) {
      latestByKeyword.set(row.keyword_id, row);
    }
  }

  const updates = [];
  let miss = 0;
  for (const kw of keywords) {
    const kwId = keywordMap.get(String(kw.id));
    if (!kwId) { miss++; continue; }
    const row = latestByKeyword.get(kwId);
    if (!row) { miss++; continue; }
    const newCount = kw.challengeCount || 0;
    if (row.content_count === newCount) continue; // no change
    updates.push({ id: row.id, content_count: newCount });
  }

  if (isDryRun) {
    return { ok: updates.length, skip: keywords.length - updates.length - miss, miss, sample: updates.slice(0, 3) };
  }

  // 개별 update (upsert는 NOT NULL 컬럼들 때문에 INSERT 분기에서 실패함)
  let okCount = 0;
  const CONCURRENCY = 20;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(u =>
      supabase.from('keyword_rankings').update({ content_count: u.content_count }).eq('id', u.id)
    ));
    for (const { error } of results) {
      if (!error) okCount++;
    }
  }
  return { ok: okCount, skip: keywords.length - updates.length - miss, miss };
}

async function main() {
  console.log('=== keyword_rankings.content_count 백필 ===');
  console.log(`mode: ${isDryRun ? 'DRY RUN' : 'WRITE'}, resume: ${isResume}, limit: ${limitCount}`);
  if (filterDisplayName) console.log(`filter display_name: ${filterDisplayName}`);
  if (filterNaverId) console.log(`filter naver_id: ${filterNaverId}`);

  const keywordMap = await loadKeywordMap();
  console.log(`keyword 매핑 로드: ${keywordMap.size}개`);

  const influencers = await loadInfluencers();
  console.log(`인플루언서 ${influencers.length}명`);
  if (influencers.length === 0) return;

  const progress = loadProgress();
  const startIdx = isResume ? progress.lastIndex : 0;
  const total = Math.min(influencers.length, startIdx + limitCount);

  let totalOk = 0, totalMiss = 0, totalSkip = 0, processed = 0;
  const t0 = Date.now();
  const PARALLEL = 5; // 인플루언서 동시 처리

  for (let i = startIdx; i < total; i += PARALLEL) {
    const chunk = influencers.slice(i, Math.min(i + PARALLEL, total));
    const results = await Promise.all(chunk.map(async (inf) => {
      try {
        const r = await processInfluencer(inf, keywordMap);
        return { inf, r };
      } catch (err) {
        return { inf, err };
      }
    }));

    for (const { inf, r, err } of results) {
      if (err) {
        process.stdout.write(`\n  ${inf.display_name || inf.naver_id} 실패: ${err.message}\n`);
        continue;
      }
      totalOk += r.ok;
      totalMiss += r.miss;
      totalSkip += r.skip;
      processed++;
    }

    const lastIdx = i + chunk.length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const eta = processed > 0 ? Math.round(((total - lastIdx) * (Date.now() - t0) / processed / 1000 / 60)) : '-';
    const lastName = chunk[chunk.length - 1].display_name || chunk[chunk.length - 1].naver_id;
    process.stdout.write(`\r  [${lastIdx}/${total}] ${lastName.slice(0, 18).padEnd(18)} | total ok=${totalOk} miss=${totalMiss} | ${elapsed}s | ETA ${eta}m   `);

    if (!isDryRun && processed % 50 === 0) {
      saveProgress({ lastIndex: lastIdx });
    }

    await sleep(DELAY_MS);
  }

  if (!isDryRun) saveProgress({ lastIndex: total });

  console.log(`\n\n=== 완료 ===`);
  console.log(`처리 ${processed}명 / 갱신 ${totalOk}건 / 매칭실패 ${totalMiss} / 변동없음 ${totalSkip}`);
}

main().catch(err => { console.error(err); process.exit(1); });
