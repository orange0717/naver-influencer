#!/usr/bin/env node
/**
 * naver_owner_id 가 NULL 인 인플루언서들 보정 스크립트
 *
 * 1. in.naver.com/{naverId} HTML 에서 ownerId 추출
 * 2. DB 업데이트
 * 3. participated-keywords API 로 last_challenged_at, total_keywords 갱신
 *
 * 사용법:
 *   node scripts/fix-missing-owner-ids.mjs
 *   node scripts/fix-missing-owner-ids.mjs --limit 50
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) { console.error('.env.local 없음'); process.exit(1); }
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PROGRESS_FILE = resolve(__dirname, '.fix-owner-ids-progress.json');
const DELAY_MS = 700;

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1]) : Infinity;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isValidNaverId(id) {
  return /^[a-zA-Z0-9_.]{2,30}$/.test(id);
}

async function fetchHtml(naverId) {
  if (!isValidNaverId(naverId)) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://in.naver.com/${naverId}`, {
        headers: { 'User-Agent': USER_AGENT, Referer: 'https://in.naver.com/' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return res.text();
      if (res.status === 404) return null;
      await sleep(3000);
    } catch { await sleep(3000); }
  }
  return null;
}

function extractOwnerId(html) {
  if (!html) return null;
  const m = html.match(/"ownerId":(\d+)/);
  return m ? m[1] : null;
}

async function fetchKeywordSummary(ownerId) {
  try {
    const res = await fetch(`${PARTICIPATED_API}?ownerId=${ownerId}&limit=1`, {
      headers: { 'User-Agent': USER_AGENT, Referer: 'https://in.naver.com/' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const total = json?.paging?.total || 0;
    const items = json?.data || [];
    const lastChallengedAt = items[0]?.lastChallengedAt || null;
    return { total, lastChallengedAt };
  } catch { return null; }
}

function loadProgress() {
  try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { processed: [], ownerFixed: 0, kwFixed: 0, failed: 0 }; }
}
function saveProgress(p) { writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 naver_owner_id NULL 인플루언서 보정');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 대상: ownerId NULL (팬수 많은 순)
  const targets = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, subscriber_count')
      .is('naver_owner_id', null)
      .order('subscriber_count', { ascending: false, nullsFirst: false })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    targets.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`🎯 대상: ${targets.length}명`);
  const progress = loadProgress();
  const done = new Set(progress.processed);
  const toProcess = targets.filter(t => !done.has(t.id)).slice(0, LIMIT);
  console.log(`🔄 이번에 처리: ${toProcess.length}명 (기처리 ${progress.processed.length})`);
  console.log();

  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.log('\n⏸  중단'); });

  for (let i = 0; i < toProcess.length; i++) {
    if (stopping) break;
    const inf = toProcess[i];
    const prefix = `  [${i + 1}/${toProcess.length}] ${inf.naver_id}`;

    const html = await fetchHtml(inf.naver_id);
    const ownerId = extractOwnerId(html);
    if (!ownerId) {
      progress.failed++;
      console.log(`${prefix} ❌ ownerId 추출 실패`);
      progress.processed.push(inf.id);
      await sleep(DELAY_MS);
      continue;
    }

    // ownerId 저장
    await supabase.from('influencers').update({ naver_owner_id: ownerId }).eq('id', inf.id);
    progress.ownerFixed++;

    // 챌린지 요약 가져오기
    await sleep(300);
    const kwInfo = await fetchKeywordSummary(ownerId);
    if (kwInfo) {
      const updateData = { total_keywords: kwInfo.total };
      if (kwInfo.lastChallengedAt) updateData.last_challenged_at = kwInfo.lastChallengedAt;
      await supabase.from('influencers').update(updateData).eq('id', inf.id);
      progress.kwFixed++;
      console.log(`${prefix} ✅ ownerId=${ownerId} 챌린지=${kwInfo.total}개`);
    } else {
      console.log(`${prefix} ⚠️  ownerId=${ownerId} (챌린지 조회 실패)`);
    }

    progress.processed.push(inf.id);
    if ((i + 1) % 10 === 0) saveProgress(progress);
    await sleep(DELAY_MS);
  }

  saveProgress(progress);
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ ownerId 보정: ${progress.ownerFixed}명`);
  console.log(`✅ 챌린지 수 갱신: ${progress.kwFixed}명`);
  console.log(`❌ 실패: ${progress.failed}명`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
