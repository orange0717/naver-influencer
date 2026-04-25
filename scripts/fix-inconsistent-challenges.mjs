#!/usr/bin/env node
/**
 * 챌린지 컬럼 불일치 인플루언서 타겟 재크롤링
 *
 * 대상:
 *   A. total_keywords = 0 AND last_challenged_at IS NOT NULL
 *   B. total_keywords > 0 AND last_challenged_at IS NULL
 *   C. total_keywords = 0 AND last_challenged_at IS NULL (실제 빈 계정 — 누락 가능성)
 *   D. top1+top2+top3 > 0 AND total_keywords = 0
 *
 * 로직은 refresh-influencer-profiles.mjs 와 동일:
 *   in.naver.com/{naverId} 프로필 파싱 + participated-keywords API 호출
 *
 * 사용법:
 *   node scripts/fix-inconsistent-challenges.mjs              # dry-run
 *   node scripts/fix-inconsistent-challenges.mjs --apply      # 실제 저장
 *   node scripts/fix-inconsistent-challenges.mjs --apply --resume
 *   node scripts/fix-inconsistent-challenges.mjs --apply --limit 100
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  PROFILE_URL: 'https://in.naver.com',
  PARTICIPATED_API: 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords',
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  DELAY_MS: 700,
  DELAY_ON_ERROR: 3000,
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT_MS: 15000,
  SAVE_INTERVAL: 25,
  PROGRESS_FILE: resolve(__dirname, '.fix-inconsistent-progress.json'),
};

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) { console.error('.env.local 없음'); process.exit(1); }
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
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, extraHeaders = {}) {
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://in.naver.com/',
          ...extraHeaders,
        },
      });
      clearTimeout(to);
      if (res.status === 429) { await sleep(4000 * Math.pow(2, attempt)); continue; }
      if (res.status >= 500 && attempt < CONFIG.MAX_RETRIES) { await sleep(CONFIG.DELAY_ON_ERROR); continue; }
      return res;
    } catch (err) {
      clearTimeout(to);
      if (attempt < CONFIG.MAX_RETRIES) { await sleep(CONFIG.DELAY_ON_ERROR); continue; }
      throw err;
    }
  }
}

async function fetchProfile(naverId) {
  const res = await fetchWithRetry(`${CONFIG.PROFILE_URL}/${naverId}`);
  if (!res.ok) return null;
  const html = await res.text();
  const idx = html.indexOf('__PRELOADED_STATE__');
  if (idx === -1) return null;
  const jsonStart = html.indexOf('{', idx);
  if (jsonStart === -1) return null;
  let depth = 0, jsonEnd = -1;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
  }
  if (jsonEnd === -1) return null;
  let state;
  try { state = JSON.parse(html.substring(jsonStart, jsonEnd)); } catch { return null; }
  const data = state?.space?.data;
  if (!data) return null;
  const rawSub = (typeof data?.stats?.subscriberCount === 'number')
    ? data.stats.subscriberCount
    : (typeof data?.subscriberCount === 'number' ? data.subscriberCount : null);
  return {
    totalFollowerCount: typeof data.totalFollowerCount === 'number' ? data.totalFollowerCount : null,
    subscriberCount: rawSub,
    ownerId: data.ownerId ? String(data.ownerId) : null,
    lastChallengedAt: (typeof data?.keywordChallengeInfo?.lastChallengedAt === 'string')
      ? data.keywordChallengeInfo.lastChallengedAt : null,
  };
}

async function fetchTotalKeywords(ownerId, naverId) {
  const url = `${CONFIG.PARTICIPATED_API}?ownerId=${ownerId}&limit=1`;
  const res = await fetchWithRetry(url, { Referer: `${CONFIG.PROFILE_URL}/${naverId}` });
  if (!res.ok) return null;
  let json;
  try { json = await res.json(); } catch { return null; }
  const total = json?.paging?.total;
  return typeof total === 'number' && total >= 0 ? total : null;
}

function loadProgress() {
  if (existsSync(CONFIG.PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8')); } catch {}
  }
  return { lastIndex: 0, lastRunAt: null };
}
function saveProgress(p) { writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(p, null, 2)); }

// ─── CLI ───
const args = process.argv.slice(2);
const hasArg = (n) => args.includes(n);
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const isApply = hasArg('--apply');
const isResume = hasArg('--resume');
const limitCount = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;

// ─── 대상 선정 ───
async function selectTargets() {
  // 배치 조회 (단일 쿼리로 4k는 여유)
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, subscriber_count, total_follower_count, total_keywords, top1_count, top2_count, top3_count, naver_owner_id, last_challenged_at, last_crawled_at')
      .or('total_keywords.eq.0,last_challenged_at.is.null')
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) { console.error('조회 실패:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
    if (all.length >= 20000) break;
  }
  // 불일치 & 빈 계정 전부 포함
  return all.filter(inf => {
    const kw = inf.total_keywords || 0;
    const hasLast = !!inf.last_challenged_at;
    const hasTop = (inf.top1_count || 0) + (inf.top2_count || 0) + (inf.top3_count || 0) > 0;
    // A: kw=0 AND last 있음 / B: kw>0 AND last 없음 / C: 둘다없음 / D: top>0 AND kw=0
    return (kw === 0 && hasLast) || (kw > 0 && !hasLast) || (kw === 0 && !hasLast) || (hasTop && kw === 0);
  });
}

async function main() {
  console.log('=== 불일치 챌린지 컬럼 재크롤링 ===');
  console.log(`모드: ${isApply ? 'APPLY' : 'DRY-RUN'}, limit=${limitCount === Infinity ? 'all' : limitCount}`);
  if (!isApply) console.log('*** dry-run. --apply 를 주어야 DB 저장 ***');

  const targets = await selectTargets();
  console.log(`대상 인플루언서: ${targets.length}명`);
  if (targets.length === 0) { console.log('대상 없음'); return; }

  const progress = isResume ? loadProgress() : { lastIndex: 0, lastRunAt: new Date().toISOString() };
  const startIdx = isResume ? (progress.lastIndex || 0) : 0;
  const endIdx = Math.min(targets.length, startIdx + limitCount);

  let updated = 0, noChange = 0, skipped = 0, failed = 0;
  let cancelled = false;
  process.on('SIGINT', () => { console.log('\n중단 요청 수신'); cancelled = true; });

  for (let i = startIdx; i < endIdx; i++) {
    if (cancelled) break;
    const inf = targets[i];
    try {
      const profile = await fetchProfile(inf.naver_id);
      if (!profile || !profile.ownerId) {
        skipped++;
        process.stdout.write(`\r  [${i + 1}/${targets.length}] ${inf.naver_id}: 프로필 없음 (u${updated} n${noChange} s${skipped} f${failed})       `);
        await sleep(CONFIG.DELAY_MS);
        continue;
      }
      const totalKw = await fetchTotalKeywords(profile.ownerId, inf.naver_id);

      const updateData = {};
      if (profile.totalFollowerCount !== null && profile.totalFollowerCount > 0 && profile.totalFollowerCount !== inf.total_follower_count) {
        updateData.total_follower_count = profile.totalFollowerCount;
      }
      if (profile.subscriberCount !== null && profile.subscriberCount > 0 && profile.subscriberCount !== inf.subscriber_count) {
        updateData.subscriber_count = profile.subscriberCount;
      }
      if (!inf.naver_owner_id && profile.ownerId) {
        updateData.naver_owner_id = profile.ownerId;
      }
      if (totalKw !== null && totalKw !== inf.total_keywords) {
        updateData.total_keywords = totalKw;
      }
      // last_challenged_at — 우선순위로 누락된 값 채우기
      if (profile.lastChallengedAt) {
        const freshIso = new Date(profile.lastChallengedAt).toISOString();
        const currentIso = inf.last_challenged_at ? new Date(inf.last_challenged_at).toISOString() : null;
        if (currentIso !== freshIso) {
          updateData.last_challenged_at = freshIso;
        }
        // last_crawled_at 도 기존 스크립트 규칙 그대로
        const currentCrawl = inf.last_crawled_at ? new Date(inf.last_crawled_at).toISOString() : null;
        if (currentCrawl !== freshIso) {
          updateData.last_crawled_at = freshIso;
        }
      }

      if (Object.keys(updateData).length === 0) {
        noChange++;
        process.stdout.write(`\r  [${i + 1}/${targets.length}] ${inf.naver_id}: 변화없음 kw=${totalKw ?? '?'} (u${updated} n${noChange} s${skipped} f${failed})     `);
      } else {
        updateData.updated_at = new Date().toISOString();
        if (isApply) {
          const { error } = await supabase.from('influencers').update(updateData).eq('id', inf.id);
          if (error) {
            failed++;
            console.error(`\n  DB 오류 [${inf.naver_id}]: ${error.message}`);
            await sleep(CONFIG.DELAY_ON_ERROR);
            continue;
          }
        }
        updated++;
        const chg = Object.entries(updateData)
          .filter(([k]) => k !== 'updated_at')
          .map(([k, v]) => `${k.replace('_count', '').replace('total_', '').replace('last_', '')}=${String(v).slice(0, 20)}`).join(', ');
        process.stdout.write(`\r  [${i + 1}/${targets.length}] ${inf.naver_id}: ${chg} (u${updated} n${noChange} s${skipped} f${failed})     `);
      }
    } catch (err) {
      failed++;
      console.error(`\n  오류 [${inf.naver_id}]:`, err.message);
      await sleep(CONFIG.DELAY_ON_ERROR);
    }
    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      progress.lastIndex = i + 1;
      progress.lastRunAt = new Date().toISOString();
      saveProgress(progress);
    }
    await sleep(CONFIG.DELAY_MS);
  }

  progress.lastIndex = cancelled ? progress.lastIndex : endIdx;
  progress.lastRunAt = new Date().toISOString();
  saveProgress(progress);

  console.log('\n\n=== 완료 ===');
  console.log(`  업데이트: ${updated}명`);
  console.log(`  변화없음: ${noChange}명`);
  console.log(`  스킵(프로필 없음): ${skipped}명`);
  console.log(`  실패: ${failed}명`);
  if (!isApply) console.log('\n*** dry-run. --apply 로 다시 실행 ***');
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1); });
