#!/usr/bin/env node
/**
 * total_keywords = 500 (네이버 API 상한)인 인플루언서만 타깃으로
 * participated-keywords API 전체 페이지네이션해서 실제 개수 확보.
 *
 * 사용: node scripts/fix-500-keywords.mjs [--dry-run] [--limit 100]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PROGRESS_FILE = resolve(__dirname, '.fix-500-progress.json');
const DELAY_MS = 400;
const PAGE_LIMIT = 100; // 50 * 100 = 최대 5,000 키워드까지 지원

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1]) : Infinity;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Referer: 'https://in.naver.com/' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) { await sleep(5000); continue; }
      if (!res.ok) { if (i < retries) { await sleep(2000); continue; } return null; }
      return res;
    } catch {
      if (i < retries) { await sleep(2000); continue; }
      return null;
    }
  }
  return null;
}

async function countAllKeywords(ownerId) {
  let total = 0;
  let cursor;
  for (let page = 0; page < PAGE_LIMIT; page++) {
    let url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;
    const res = await fetchWithRetry(url);
    if (!res) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    const items = json?.data || [];
    total += items.length;
    cursor = json?.paging?.nextCursor;
    if (!cursor || items.length < 50) break;
    await sleep(DELAY_MS);
  }
  return total;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { processedIds: [], updated: 0, unchanged: 0, failed: 0 }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔧 total_keywords=500 인플루언서 정확도 보정`);
  if (DRY_RUN) console.log('⚠️  DRY-RUN 모드 (DB 저장 안 함)');
  if (LIMIT < Infinity) console.log(`📊 한도: ${LIMIT}명`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // total_keywords=500 인 인플루언서 조회 (Supabase 기본 1000 제한 페이지네이션)
  const targets = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('influencers')
      .select('id, naver_id, naver_owner_id, total_keywords')
      .eq('total_keywords', 500)
      .not('naver_owner_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    targets.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`🎯 대상 인플루언서: ${targets.length}명`);

  const progress = loadProgress();
  const processedSet = new Set(progress.processedIds);
  const toProcess = targets.filter(t => !processedSet.has(t.id)).slice(0, LIMIT);
  console.log(`🔄 이번 실행에서 처리: ${toProcess.length}명 (이미 처리: ${progress.processedIds.length}명)\n`);

  let stopping = false;
  process.on('SIGINT', () => { console.log('\n⏸  중단 요청, 저장 후 종료'); stopping = true; });

  for (let i = 0; i < toProcess.length; i++) {
    if (stopping) break;
    const inf = toProcess[i];
    const actualCount = await countAllKeywords(inf.naver_owner_id);

    if (actualCount === null) {
      progress.failed++;
      console.log(`  [${i + 1}/${toProcess.length}] ${inf.naver_id} — ❌ API 오류`);
    } else if (actualCount === 500) {
      progress.unchanged++;
      console.log(`  [${i + 1}/${toProcess.length}] ${inf.naver_id} — 실제로도 500 (유지)`);
    } else {
      if (!DRY_RUN) {
        await supabase
          .from('influencers')
          .update({ total_keywords: actualCount })
          .eq('id', inf.id);
      }
      progress.updated++;
      const arrow = actualCount > 500 ? '↑' : '↓';
      console.log(`  [${i + 1}/${toProcess.length}] ${inf.naver_id} — 500 → ${actualCount} ${arrow}`);
    }

    progress.processedIds.push(inf.id);
    if ((i + 1) % 10 === 0) saveProgress(progress);
  }

  saveProgress(progress);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ 업데이트: ${progress.updated}명 · 유지: ${progress.unchanged}명 · 실패: ${progress.failed}명`);
  console.log(`📌 누적 처리: ${progress.processedIds.length} / ${targets.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
