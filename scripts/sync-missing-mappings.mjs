#!/usr/bin/env node
/**
 * influencer_keywords 매핑이 누락된 활동 인플루언서만 골라서 동기화
 *
 * 대상:
 *   - influencer_keywords 에 단 한 건도 매핑이 없는 인플루언서
 *   - 활동 중: last_challenged_at >= NOW() - 1년 OR integrated_top3_count > 0
 *
 * 로직:
 *   sync-influencer-keywords.mjs 의 1·2단계와 동일
 *     1단계: 프로필 페이지 HTML Apollo State에서 키워드 추출
 *     2단계: Feed API 병렬 스캔 (본인 카테고리만)
 *
 * 사용법:
 *   node scripts/sync-missing-mappings.mjs                     # 전체 실행
 *   node scripts/sync-missing-mappings.mjs --limit 50          # 최대 50명
 *   node scripts/sync-missing-mappings.mjs --resume            # 진행 파일 이어서
 *   node scripts/sync-missing-mappings.mjs --dry-run           # 대상만 출력
 *   node scripts/sync-missing-mappings.mjs --concurrency 5     # Feed API 동시성
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = resolve(__dirname, '.sync-missing-mappings-progress.json');

// .env.local 로드
const envPath = resolve(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FEED_API = 'https://gw.in.naver.com/feed/query/v1/discover/collection/searched';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 인자 파싱
const hasArg = (n) => process.argv.includes(n);
const getArg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const IS_RESUME = hasArg('--resume');
const IS_DRY_RUN = hasArg('--dry-run');
const CONCURRENCY = getArg('--concurrency') ? parseInt(getArg('--concurrency')) : 5;
const DELAY_MS = 150; // 배치 간 딜레이

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  return { lastIndex: 0, processed: 0, totalInserted: 0, failed: [] };
}
function saveProgress(p) { writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function fetchProfileKeywords(urlId) {
  try {
    const res = await fetch(`https://in.naver.com/${urlId}/challenge`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const marker = 'window.__APOLLO_STATE__ = ';
    const start = html.indexOf(marker);
    if (start === -1) return [];
    const jsonStart = start + marker.length;
    let depth = 0, i = jsonStart;
    for (; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) break; }
    }
    const apollo = JSON.parse(html.slice(jsonStart, i + 1));
    const keywords = [];
    for (const [key, val] of Object.entries(apollo)) {
      if (key.startsWith('ParticipatedKeywordView:') && val.name) {
        keywords.push({ name: val.name });
      }
    }
    return keywords;
  } catch {
    return [];
  }
}

async function checkInfluencerInKeyword(keywordNaverId, targetNaverId) {
  let cursor;
  for (let page = 0; page < 10; page++) {
    let url = `${FEED_API}?keywordId=${keywordNaverId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://in.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) break;
      const json = await res.json();
      const items = json?.data || [];
      for (const item of items) {
        if (item.creator?.urlId === targetNaverId) return true;
      }
      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch {
      break;
    }
  }
  return false;
}

async function syncOne(inf) {
  const naverId = inf.naver_id;
  const category = inf.my_keyword_category || inf.category;
  if (!naverId) return { inserted: 0, skipped: 'no_naver_id' };
  if (!category) return { inserted: 0, skipped: 'no_category' };

  let inserted = 0;

  // 1단계: 프로필 HTML
  const profileKeywords = await fetchProfileKeywords(naverId);
  if (profileKeywords.length > 0) {
    for (const pk of profileKeywords) {
      const { data: kwMatch } = await supabase
        .from('keyword_challenges')
        .select('id')
        .eq('keyword', pk.name)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (kwMatch) {
        const { error } = await supabase
          .from('influencer_keywords')
          .upsert(
            { influencer_id: inf.id, keyword_id: kwMatch.id },
            { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true }
          );
        if (!error) inserted++;
      }
    }
  }

  // 2단계: 본인 카테고리 Feed API 스캔
  const PAGE_SIZE = 1000;
  let keywords = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('keyword_challenges')
      .select('id, naver_keyword_id')
      .eq('category', category)
      .eq('is_active', true)
      .not('naver_keyword_id', 'is', null)
      .order('participant_count', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    keywords = keywords.concat(data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const batch = keywords.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(kw => checkInfluencerInKeyword(kw.naver_keyword_id, naverId)));
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        const { error } = await supabase
          .from('influencer_keywords')
          .upsert(
            { influencer_id: inf.id, keyword_id: batch[j].id },
            { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true }
          );
        if (!error) inserted++;
      }
    }
    await sleep(DELAY_MS);
  }

  return { inserted, scanned: keywords.length, category };
}

async function fetchTargets() {
  // 1) 활동 인플루언서 페이지네이션 수집 (~13k, 작은 컬럼만)
  console.log('🔍 활동 인플루언서 조회 중...');
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const active = [];
  let off = 0;
  while (true) {
    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, category, my_keyword_category')
      .or(`last_challenged_at.gte.${oneYearAgo},integrated_top3_count.gt.0`)
      .order('id', { ascending: true })
      .range(off, off + 999);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    active.push(...data);
    if (data.length < 1000) break;
    off += data.length;
  }
  console.log(`  활동: ${active.length}명`);

  // 2) 인플루언서별 매핑 존재 여부 head count 병렬 체크 (정확함)
  console.log('🔍 매핑 존재 여부 병렬 체크 중...');
  const mapped = new Set();
  const CHECK_CONC = 20;
  for (let i = 0; i < active.length; i += CHECK_CONC) {
    const batch = active.slice(i, i + CHECK_CONC);
    const results = await Promise.all(batch.map(async (inf) => {
      const { count } = await supabase
        .from('influencer_keywords')
        .select('*', { count: 'exact', head: true })
        .eq('influencer_id', inf.id);
      return { id: inf.id, hasMapping: (count || 0) > 0 };
    }));
    for (const r of results) if (r.hasMapping) mapped.add(r.id);
    if (i % 200 === 0) process.stdout.write(`\r  ${Math.min(i + CHECK_CONC, active.length)}/${active.length} (mapped=${mapped.size})...`);
  }
  console.log(`\n  매핑 있음: ${mapped.size}명`);

  const targets = active.filter(a => !mapped.has(a.id));
  console.log(`  활동 + 매핑 누락: ${targets.length}명`);
  return targets;
}

async function main() {
  console.log('=== sync-missing-mappings ===');
  console.log(`모드: ${IS_DRY_RUN ? 'DRY-RUN' : 'APPLY'} | resume=${IS_RESUME} | limit=${LIMIT === Infinity ? '∞' : LIMIT} | concurrency=${CONCURRENCY}`);

  const targets = await fetchTargets();
  if (targets.length === 0) {
    console.log('처리할 인플루언서가 없습니다.');
    return;
  }

  if (IS_DRY_RUN) {
    console.log('\n샘플 (최대 10명):');
    for (const inf of targets.slice(0, 10)) {
      console.log(`  - ${inf.display_name} (${inf.naver_id}) / ${inf.my_keyword_category || inf.category}`);
    }
    console.log(`\n총 ${targets.length}명 대상. --dry-run 종료.`);
    return;
  }

  const progress = loadProgress();
  const startIdx = IS_RESUME ? progress.lastIndex : 0;
  const endIdx = Math.min(targets.length, startIdx + LIMIT);
  console.log(`\n처리 범위: [${startIdx} → ${endIdx}) / 전체 ${targets.length}명\n`);

  const t0 = Date.now();
  for (let i = startIdx; i < endIdx; i++) {
    const inf = targets[i];
    const tStart = Date.now();
    try {
      const result = await syncOne(inf);
      progress.processed++;
      progress.totalInserted += result.inserted || 0;
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      const totalElapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${i + 1}/${endIdx}] ${inf.display_name} (${inf.naver_id}) → ${result.inserted}개 매핑 / ${elapsed}초 (총 ${totalElapsed}초)${result.skipped ? ` [SKIP: ${result.skipped}]` : ''}`);
    } catch (e) {
      progress.failed.push({ id: inf.id, naver_id: inf.naver_id, error: e.message });
      console.error(`[${i + 1}/${endIdx}] ❌ ${inf.display_name}: ${e.message}`);
    }
    progress.lastIndex = i + 1;
    if ((i + 1) % 5 === 0) saveProgress(progress);
    await sleep(300); // 인플루언서 간 추가 딜레이
  }

  saveProgress(progress);
  console.log(`\n=== 완료 ===`);
  console.log(`  처리: ${progress.processed}명 / 매핑 추가: ${progress.totalInserted}건 / 실패: ${progress.failed.length}명`);
  console.log(`  진행 파일: ${PROGRESS_FILE}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
