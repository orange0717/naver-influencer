#!/usr/bin/env node
/**
 * 인플루언서 프로필(팬수 + 팔로워수 + 챌린지수) 일괄 갱신 스크립트
 *
 * refresh-follower.ts 의 로직을 그대로 배치로 실행.
 * - in.naver.com/{naverId} 에서 subscriberCount, totalFollowerCount, ownerId 추출
 * - gw.in.naver.com/.../participated-keywords?ownerId=...&limit=1 의 paging.total 추출
 * - 기존 값이 null/0 이거나 변화가 있을 때만 DB 갱신
 *
 * 기본 동작:
 *   - 활성 인플루언서(keyword_score > 0)만 대상
 *   - updated_at이 N일 이상 오래된 것만 대상(기본 3일)
 *   - 가장 오래된 것부터 처리 (ASC)
 *   - 기본값: dry-run (DB 저장 안 함). --apply 를 주어야 실제 저장.
 *
 * 사용법:
 *   node scripts/refresh-influencer-profiles.mjs                    # dry-run (기본)
 *   node scripts/refresh-influencer-profiles.mjs --apply             # 실제 저장
 *   node scripts/refresh-influencer-profiles.mjs --apply --limit 10  # 테스트용 소량 실행
 *   node scripts/refresh-influencer-profiles.mjs --apply --stale-days 7
 *   node scripts/refresh-influencer-profiles.mjs --apply --naver-id chestnuts.zip  # 특정 1명
 *   node scripts/refresh-influencer-profiles.mjs --apply --resume    # 중단 지점부터 재개
 *   node scripts/refresh-influencer-profiles.mjs --apply --all       # 전체(오래된 순)
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
  PROGRESS_FILE: resolve(__dirname, '.refresh-profiles-progress.json'),
};

// ─── 환경변수 로드 ───

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local 파일이 없습니다.');
    process.exit(1);
  }
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

// ─── 유틸 ───

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

      if (res.status === 429) {
        const wait = 4000 * Math.pow(2, attempt);
        console.log(`\n  429 Rate Limited — ${wait}ms 대기`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt < CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(to);
      if (attempt < CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      throw err;
    }
  }
}

function loadProgress() {
  if (existsSync(CONFIG.PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8')); } catch { /* corrupt */ }
  }
  return { lastIndex: 0, lastRunAt: null };
}

function saveProgress(progress) {
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── 네이버 프로필 파싱 ───

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
  try { state = JSON.parse(html.substring(jsonStart, jsonEnd)); }
  catch { return null; }

  const data = state?.space?.data;
  if (!data) return null;

  return {
    totalFollowerCount: typeof data.totalFollowerCount === 'number' ? data.totalFollowerCount : null,
    subscriberCount: typeof data.subscriberCount === 'number' ? data.subscriberCount : null,
    ownerId: data.ownerId ? String(data.ownerId) : null,
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

// ─── CLI ───

const args = process.argv.slice(2);
const hasArg = (n) => args.includes(n);
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const isApply = hasArg('--apply');
const isAll = hasArg('--all');
const isResume = hasArg('--resume');
const limitCount = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const staleDays = getArg('--stale-days') ? parseInt(getArg('--stale-days')) : 3;
const onlyNaverId = getArg('--naver-id');

if (!isFinite(limitCount) && !isAll && !onlyNaverId) {
  // 안전장치: --all 또는 --limit 또는 --naver-id 를 명시적으로 주어야 실행
  console.error('사용법 오류: --all, --limit N, 또는 --naver-id ID 중 하나는 반드시 지정해야 합니다.');
  process.exit(1);
}

// ─── 메인 ───

async function main() {
  console.log('=== 인플루언서 프로필(팬수/챌린지수) 일괄 갱신 ===');
  console.log(`모드: ${isApply ? 'APPLY (DB 저장)' : 'DRY-RUN (저장 안 함)'}, limit=${limitCount === Infinity ? 'all' : limitCount}, stale-days=${staleDays}${onlyNaverId ? `, naver-id=${onlyNaverId}` : ''}`);
  if (!isApply) console.log('*** dry-run 모드. --apply 를 주어야 DB에 저장됩니다 ***');

  // 대상 조회
  const influencers = [];

  if (onlyNaverId) {
    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, subscriber_count, total_follower_count, total_keywords, naver_owner_id, updated_at')
      .eq('naver_id', onlyNaverId)
      .limit(1)
      .maybeSingle();
    if (error) { console.error('조회 실패:', error.message); process.exit(1); }
    if (!data) { console.error(`naver_id=${onlyNaverId} 인플루언서를 찾을 수 없습니다.`); process.exit(1); }
    influencers.push(data);
  } else {
    // 활성 인플루언서 + stale 필터
    const staleThreshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('influencers')
        .select('id, naver_id, subscriber_count, total_follower_count, total_keywords, naver_owner_id, updated_at')
        .gt('keyword_score', 0)
        .or(`updated_at.is.null,updated_at.lt.${staleThreshold}`)
        .order('updated_at', { ascending: true, nullsFirst: true })
        .range(offset, offset + 999);
      if (error) { console.error('조회 실패:', error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      influencers.push(...data);
      offset += data.length;
      if (data.length < 1000) break;
      if (influencers.length >= 10000) break; // 안전상 상한
    }
  }

  const total = influencers.length;
  console.log(`대상 인플루언서: ${total}명`);
  if (total === 0) { console.log('갱신할 대상이 없습니다.'); return; }

  const progress = isResume ? loadProgress() : { lastIndex: 0, lastRunAt: new Date().toISOString() };
  const startIdx = isResume ? (progress.lastIndex || 0) : 0;
  const endIdx = Math.min(total, startIdx + limitCount);

  let updated = 0, noChange = 0, skipped = 0, failed = 0;
  let cancelled = false;
  process.on('SIGINT', () => { console.log('\n중단 요청 수신. 진행 저장 후 종료합니다...'); cancelled = true; });

  for (let i = startIdx; i < endIdx; i++) {
    if (cancelled) break;
    const inf = influencers[i];

    try {
      // 1) 프로필
      const profile = await fetchProfile(inf.naver_id);
      if (!profile || !profile.ownerId) {
        skipped++;
        process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: 프로필 없음 (u${updated} n${noChange} s${skipped} f${failed})         `);
        await sleep(CONFIG.DELAY_MS);
        continue;
      }

      // 2) 참여 키워드 총수
      const totalKw = await fetchTotalKeywords(profile.ownerId, inf.naver_id);

      // 변경 감지용 덮어쓸 필드만 모음 (값이 있고 유의미한 변화가 있을 때만)
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

      if (Object.keys(updateData).length === 0) {
        noChange++;
        process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: 변화 없음 (kw=${totalKw ?? '?'}) (u${updated} n${noChange} s${skipped} f${failed})       `);
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
        const changes = Object.entries(updateData)
          .filter(([k]) => k !== 'updated_at')
          .map(([k, v]) => `${k.replace('_count', '').replace('total_', '')}=${v}`).join(', ');
        process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: ${changes} (u${updated} n${noChange} s${skipped} f${failed})         `);
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
  console.log(`  변화 없음: ${noChange}명`);
  console.log(`  스킵(프로필 없음): ${skipped}명`);
  console.log(`  실패: ${failed}명`);
  if (!isApply) console.log('\n*** dry-run 결과입니다. 실제 반영하려면 --apply 를 추가해 다시 실행하세요. ***');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
