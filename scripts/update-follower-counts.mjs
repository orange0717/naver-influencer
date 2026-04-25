#!/usr/bin/env node
/**
 * 인플루언서 팔로워수 ���데이트 스크립트
 *
 * 네이버 프로필 페이지에서 totalFollowerCount를 추출하여 DB 업데이트.
 * subscriber_count(팬수)도 프로필에서 가져올 수 있으면 함께 업데이트.
 *
 * 사용법:
 *   node scripts/update-follower-counts.mjs                # 0인 인플루언서만
 *   node scripts/update-follower-counts.mjs --all          # 전체 업데이트
 *   node scripts/update-follower-counts.mjs --limit 500    # 최대 N명
 *   node scripts/update-follower-counts.mjs --resume       # 중단 지점부터 재개
 *   node scripts/update-follower-counts.mjs --dry-run      # DB 저장 없이 테스트
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  PROFILE_URL: 'https://in.naver.com',
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  DELAY_MS: 600,
  DELAY_ON_ERROR: 3000,
  MAX_RETRIES: 3,
  SAVE_INTERVAL: 50,
  PROGRESS_FILE: resolve(__dirname, '.update-follower-progress.json'),
};

// ─── 환경변수 ───

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local 파일이 없습니다.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── 유틸리티 ───

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://in.naver.com/',
        },
      });
      clearTimeout(timeout);

      if (res.status === 429) {
        const wait = 4000 * Math.pow(2, attempt);
        console.log(`  429 Rate Limited, ${wait}ms 대기...`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt < retries) {
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      throw err;
    }
  }
}

function loadProgress() {
  if (existsSync(CONFIG.PROGRESS_FILE)) {
    return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8'));
  }
  return { lastIndex: 0 };
}

function saveProgress(progress) {
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── 프로필 페이지에서 팔로워수 추출 ───

async function fetchFollowerCount(naverId) {
  try {
    const res = await fetchWithRetry(`${CONFIG.PROFILE_URL}/${naverId}`);
    if (!res.ok) return null;
    const html = await res.text();

    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return null;

    const eqIdx = html.indexOf('=', idx);
    const jsonStr = html.substring(eqIdx + 1);
    const braceIdx = jsonStr.indexOf('{');
    if (braceIdx === -1) return null;

    const sub = jsonStr.substring(braceIdx);
    let depth = 0, end = -1;
    for (let i = 0; i < sub.length; i++) {
      if (sub[i] === '{') depth++;
      if (sub[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end === -1) return null;

    const state = JSON.parse(sub.substring(0, end));
    const data = state?.space?.data;
    if (!data) return null;

    return {
      totalFollowerCount: data.totalFollowerCount || 0,
      subscriberCount: data.subscriberCount || 0,
      ownerId: data.ownerId ? String(data.ownerId) : null,
      createdAt: data.createdAt && typeof data.createdAt === 'string' ? data.createdAt : null,
    };
  } catch {
    return null;
  }
}

// ─── CLI 인자 ───

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const updateAll = hasArg('--all');
const limitCount = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const isResume = hasArg('--resume');
const isDryRun = hasArg('--dry-run');

// ─── 메인 ──���

async function main() {
  console.log('=== 인플루언서 팔로워수 업데이트 ===');
  console.log(`옵션: all=${updateAll}, limit=${limitCount === Infinity ? 'all' : limitCount}, resume=${isResume}, dry-run=${isDryRun}`);

  // 대상 인플루언서 조회
  const influencers = [];
  let queryOffset = 0;
  while (true) {
    let query = supabase
      .from('influencers')
      .select('id, naver_id, total_follower_count, subscriber_count, naver_owner_id')
      .order('subscriber_count', { ascending: false });

    if (!updateAll) {
      query = query.eq('total_follower_count', 0);
    }

    const { data: batch } = await query.range(queryOffset, queryOffset + 999);
    if (!batch || batch.length === 0) break;
    influencers.push(...batch);
    queryOffset += batch.length;
    if (batch.length < 1000) break;
  }

  const total = influencers.length;
  console.log(`대상 인플루언서: ${total}명`);

  if (total === 0) {
    console.log('업데이트할 인플루언서가 없습니다.');
    return;
  }

  const progress = isResume ? loadProgress() : { lastIndex: 0 };
  const startIdx = isResume ? progress.lastIndex : 0;
  let updated = 0, skipped = 0, failed = 0;

  for (let i = startIdx; i < Math.min(total, startIdx + limitCount); i++) {
    const inf = influencers[i];

    try {
      const result = await fetchFollowerCount(inf.naver_id);

      if (!result || result.totalFollowerCount === 0) {
        skipped++;
        process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: 데이터 없음 (${updated} updated, ${skipped} skipped, ${failed} failed)`);
        await sleep(CONFIG.DELAY_MS);
        continue;
      }

      if (!isDryRun) {
        const updateData = {
          total_follower_count: result.totalFollowerCount,
        };

        // subscriberCount가 있��면 업데이트
        if (result.subscriberCount > 0) {
          updateData.subscriber_count = result.subscriberCount;
        }

        // ownerId가 없으면 업데이트
        if (!inf.naver_owner_id && result.ownerId) {
          updateData.naver_owner_id = result.ownerId;
        }

        // 선정일이 없으면 업데이트
        if (result.createdAt) {
          updateData.naver_created_at = result.createdAt;
        }

        await supabase.from('influencers').update(updateData).eq('id', inf.id);
      }

      updated++;
      process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: follower=${result.totalFollowerCount} (${updated} updated, ${skipped} skipped, ${failed} failed)  `);
    } catch (err) {
      failed++;
      console.error(`\n  오류 [${inf.naver_id}]:`, err.message);
    }

    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      progress.lastIndex = i + 1;
      saveProgress(progress);
    }

    await sleep(CONFIG.DELAY_MS);
  }

  progress.lastIndex = Math.min(total, startIdx + limitCount);
  saveProgress(progress);

  console.log(`\n\n=== 완료 ===`);
  console.log(`  업데이트: ${updated}명`);
  console.log(`  스킵 (데이터 없음): ${skipped}명`);
  console.log(`  실패: ${failed}명`);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
