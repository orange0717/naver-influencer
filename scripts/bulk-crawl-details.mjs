#!/usr/bin/env node
/**
 * 인플루언서 상세 데이터 벌크 크롤링 스크립트
 *
 * Phase 1: 선정일 크롤링 (naver_created_at)
 * Phase 2: 참여 키워드 + 순위 크롤링 (keyword_rankings, influencer_keywords)
 * Phase 3: 통계 집계 (total_keywords, integrated_top3_count 등)
 *
 * 사용법:
 *   node scripts/bulk-crawl-details.mjs                    # 전체 실행
 *   node scripts/bulk-crawl-details.mjs --phase 1          # 선정일만
 *   node scripts/bulk-crawl-details.mjs --phase 2          # 키워드+순위만
 *   node scripts/bulk-crawl-details.mjs --phase 3          # 집계만
 *   node scripts/bulk-crawl-details.mjs --limit 100        # 최대 100명
 *   node scripts/bulk-crawl-details.mjs --resume            # 중단 지점부터 재개
 *   node scripts/bulk-crawl-details.mjs --dry-run           # DB 저장 없이 테스트
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 설정 ───

const CONFIG = {
  PROFILE_URL: 'https://in.naver.com',
  PARTICIPATED_API: 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords',
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

  DELAY_MS: 600,
  DELAY_ON_ERROR: 3000,
  MAX_RETRIES: 3,
  DB_BATCH_SIZE: 50,
  SAVE_INTERVAL: 50,

  PROGRESS_FILE: resolve(__dirname, '.bulk-crawl-progress.json'),
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

async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://in.naver.com/',
          ...options.headers,
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
  return { phase1: { lastIndex: 0, done: false }, phase2: { lastIndex: 0, done: false }, phase3: { done: false } };
}

function saveProgress(progress) {
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── CLI 인자 ───

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const hasArg = (name) => args.includes(name);

const phaseOnly = getArg('--phase') ? parseInt(getArg('--phase')) : null;
const limitCount = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const isResume = hasArg('--resume');
const isDryRun = hasArg('--dry-run');

// ─── Phase 1: 선정일 크롤링 ───

async function fetchSelectionDate(naverId) {
  try {
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
      if (html[i] === '}') depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
    if (jsonEnd === -1) return null;

    const state = JSON.parse(html.substring(jsonStart, jsonEnd));
    const createdAt = state?.space?.data?.createdAt;
    return createdAt && typeof createdAt === 'string' ? createdAt : null;
  } catch {
    return null;
  }
}

async function phase1(progress) {
  console.log('\n=== Phase 1: 선정일 크롤링 ===');

  if (progress.phase1.done && !hasArg('--force')) {
    console.log('이미 완료됨. --force로 재실행 가능.');
    return;
  }

  // 전체 인플루언서 페이지네이션 조회 (Supabase 기본 1000개 제한 우회)
  const influencers = [];
  let queryOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .is('naver_created_at', null)
      .order('subscriber_count', { ascending: false })
      .range(queryOffset, queryOffset + 999);
    if (!batch || batch.length === 0) break;
    influencers.push(...batch);
    queryOffset += batch.length;
    if (batch.length < 1000) break;
  }

  const total = influencers.length;
  console.log(`선정일 없는 인플루언서: ${total}명`);

  const startIdx = isResume ? progress.phase1.lastIndex : 0;
  let updated = 0, failed = 0;

  for (let i = startIdx; i < Math.min(total, startIdx + limitCount); i++) {
    const inf = influencers[i];
    const createdAt = await fetchSelectionDate(inf.naver_id);

    if (createdAt) {
      if (!isDryRun) {
        await supabase.from('influencers').update({ naver_created_at: createdAt }).eq('id', inf.id);
      }
      updated++;
      process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: ${createdAt.slice(0, 10)} (${updated} updated, ${failed} failed)`);
    } else {
      failed++;
      process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: NOT FOUND (${updated} updated, ${failed} failed)     `);
    }

    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      progress.phase1.lastIndex = i + 1;
      saveProgress(progress);
    }

    await sleep(CONFIG.DELAY_MS);
  }

  progress.phase1.lastIndex = Math.min(total, startIdx + limitCount);
  if (progress.phase1.lastIndex >= total) progress.phase1.done = true;
  saveProgress(progress);

  console.log(`\n  완료: ${updated}명 업데이트, ${failed}명 실패`);
}

// ─── Phase 2: 참여 키워드 + 순위 크롤링 ───

function cleanKeyword(keyword) {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

async function fetchOwnerId(naverId) {
  try {
    const res = await fetchWithRetry(`${CONFIG.PROFILE_URL}/${naverId}`);
    if (!res.ok) return { ownerId: null, createdAt: null, totalFollowerCount: 0 };
    const html = await res.text();

    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return { ownerId: null, createdAt: null, totalFollowerCount: 0 };

    const jsonStart = html.indexOf('{', idx);
    let depth = 0, jsonEnd = -1;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
    if (jsonEnd === -1) return { ownerId: null, createdAt: null, totalFollowerCount: 0 };

    const state = JSON.parse(html.substring(jsonStart, jsonEnd));
    const data = state?.space?.data;
    const ownerId = data?.ownerId;
    const createdAt = data?.createdAt;
    return {
      ownerId: ownerId ? String(ownerId) : null,
      createdAt: createdAt && typeof createdAt === 'string' ? createdAt : null,
      totalFollowerCount: data?.totalFollowerCount || 0,
    };
  } catch {
    return { ownerId: null, createdAt: null, totalFollowerCount: 0 };
  }
}

async function fetchParticipatedKeywords(ownerId) {
  const results = [];
  let cursor;

  for (let page = 0; page < 100; page++) {
    let url = `${CONFIG.PARTICIPATED_API}?ownerId=${ownerId}&limit=50`;
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

async function phase2(progress) {
  console.log('\n=== Phase 2: 참여 키워드 + 순위 크롤링 ===');

  if (progress.phase2.done && !hasArg('--force')) {
    console.log('이미 완료됨. --force로 재실행 가능.');
    return;
  }

  // 전체 인플루언서 페이지네이션 조회 (Supabase 기본 1000개 제한 우회)
  const influencers = [];
  let queryOffset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('influencers')
      .select('id, naver_id, naver_owner_id, category, my_keyword_category')
      .order('subscriber_count', { ascending: false })
      .range(queryOffset, queryOffset + 999);
    if (!batch || batch.length === 0) break;
    influencers.push(...batch);
    queryOffset += batch.length;
    if (batch.length < 1000) break;
  }

  const total = influencers.length;
  console.log(`전체 인플루언서: ${total}명`);

  // 기존 keyword_challenges 매핑 로드
  const keywordMap = new Map(); // naver_keyword_id → keyword_challenges.id
  let kwOffset = 0;
  while (true) {
    const { data: kwBatch } = await supabase
      .from('keyword_challenges')
      .select('id, naver_keyword_id')
      .not('naver_keyword_id', 'is', null)
      .range(kwOffset, kwOffset + 999);
    if (!kwBatch || kwBatch.length === 0) break;
    kwBatch.forEach(kw => keywordMap.set(kw.naver_keyword_id, kw.id));
    kwOffset += kwBatch.length;
    if (kwBatch.length < 1000) break;
  }
  console.log(`키워드 매핑 로드: ${keywordMap.size}개`);

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const startIdx = isResume ? progress.phase2.lastIndex : 0;
  let processed = 0, totalKws = 0, failed = 0;

  for (let i = startIdx; i < Math.min(total, startIdx + limitCount); i++) {
    const inf = influencers[i];

    try {
      // 1. ownerId + 선정일 추출 (1번 요청으로 둘 다)
      let ownerId = inf.naver_owner_id;
      let createdAt = null;

      if (!ownerId) {
        const result = await fetchOwnerId(inf.naver_id);
        ownerId = result.ownerId;
        createdAt = result.createdAt;

        if (!ownerId) {
          failed++;
          process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: ownerId 없음 (${processed} ok, ${failed} fail)`);
          await sleep(CONFIG.DELAY_MS);
          continue;
        }

        // ownerId + 선정일 + 팔로워수 저장
        if (!isDryRun) {
          const updateData = { naver_owner_id: ownerId };
          if (createdAt) updateData.naver_created_at = createdAt;
          if (result.totalFollowerCount > 0) updateData.total_follower_count = result.totalFollowerCount;
          await supabase.from('influencers').update(updateData).eq('id', inf.id);
        }
        await sleep(CONFIG.DELAY_MS);
      }

      // 2. 참여 키워드 + 순위 가져오기
      const keywords = await fetchParticipatedKeywords(ownerId);

      if (keywords.length === 0) {
        failed++;
        process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: 참여 키워드 0개 (${processed} ok, ${failed} fail)  `);
        await sleep(CONFIG.DELAY_MS);
        continue;
      }

      if (!isDryRun) {
        // 3. 없는 키워드 생성
        const missing = keywords.filter(k => !keywordMap.has(k.id));
        if (missing.length > 0) {
          for (let j = 0; j < missing.length; j += CONFIG.DB_BATCH_SIZE) {
            const batch = missing.slice(j, j + CONFIG.DB_BATCH_SIZE);
            const rows = batch.map(kw => ({
              keyword: kw.name,
              keyword_clean: cleanKeyword(kw.name),
              category: inf.my_keyword_category || inf.category || '',
              naver_keyword_id: kw.id,
              participant_count: kw.challengeCount || 0,
              is_active: true,
            }));

            const { data: inserted } = await supabase
              .from('keyword_challenges')
              .upsert(rows, { onConflict: 'keyword_clean', ignoreDuplicates: true })
              .select('id, naver_keyword_id');

            inserted?.forEach(kw => {
              if (kw.naver_keyword_id) keywordMap.set(kw.naver_keyword_id, kw.id);
            });
          }

          // keyword_clean으로 재매칭
          for (const kw of missing) {
            if (!keywordMap.has(kw.id)) {
              const { data: existing } = await supabase
                .from('keyword_challenges')
                .select('id')
                .eq('keyword_clean', cleanKeyword(kw.name))
                .single();
              if (existing) {
                keywordMap.set(kw.id, existing.id);
                await supabase.from('keyword_challenges').update({ naver_keyword_id: kw.id }).eq('id', existing.id);
              }
            }
          }
        }

        // 4. influencer_keywords 연결
        const linkRows = keywords
          .map(kw => ({ influencer_id: inf.id, keyword_id: keywordMap.get(kw.id) }))
          .filter(r => r.keyword_id);

        for (let j = 0; j < linkRows.length; j += 100) {
          await supabase
            .from('influencer_keywords')
            .upsert(linkRows.slice(j, j + 100), { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true });
        }

        // 5. keyword_rankings 저장
        const rankRows = keywords
          .filter(kw => kw.rank > 0 && keywordMap.has(kw.id))
          .map(kw => ({
            keyword_id: keywordMap.get(kw.id),
            influencer_id: inf.id,
            rank_position: kw.rank,
            previous_rank: null,
            rank_change: 0,
            is_integrated_top3: kw.rank <= 3,
            snapshot_date: snapshotDate,
            crawled_at: new Date().toISOString(),
          }));

        for (let j = 0; j < rankRows.length; j += 100) {
          await supabase
            .from('keyword_rankings')
            .upsert(rankRows.slice(j, j + 100), { onConflict: 'keyword_id,influencer_id,snapshot_date' });
        }

        // 6. influencers 집계 업데이트
        const ranked = keywords.filter(k => k.rank > 0);
        await supabase.from('influencers').update({
          total_keywords: keywords.length,
          best_rank: ranked.length > 0 ? Math.min(...ranked.map(k => k.rank)) : null,
          avg_rank: ranked.length > 0 ? +(ranked.reduce((s, k) => s + k.rank, 0) / ranked.length).toFixed(2) : null,
          integrated_top3_count: ranked.filter(k => k.rank <= 3).length,
          last_crawled_at: new Date().toISOString(),
        }).eq('id', inf.id);
      }

      processed++;
      totalKws += keywords.length;
      process.stdout.write(`\r  [${i + 1}/${total}] ${inf.naver_id}: ${keywords.length}개 키워드 (${processed} ok, ${failed} fail)  `);
    } catch (err) {
      failed++;
      console.error(`\n  오류 [${inf.naver_id}]:`, err.message);
    }

    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      progress.phase2.lastIndex = i + 1;
      saveProgress(progress);
    }

    await sleep(CONFIG.DELAY_MS);
  }

  progress.phase2.lastIndex = Math.min(total, startIdx + limitCount);
  if (progress.phase2.lastIndex >= total) progress.phase2.done = true;
  saveProgress(progress);

  console.log(`\n  완료: ${processed}명 처리, ${totalKws}개 키워드, ${failed}명 실패`);
}

// ─── Phase 3: 집계 ───

async function phase3(progress) {
  console.log('\n=== Phase 3: 통계 집계 ===');

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);
  const sinceDateStr = sinceDate.toISOString().slice(0, 10);

  // keyword_rankings에서 집계
  console.log(`  ${sinceDateStr} 이후 데이터 기준 집계 중...`);

  const grouped = new Map();
  let offset = 0;

  while (true) {
    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select('influencer_id, keyword_id, rank_position, is_integrated_top3')
      .gte('snapshot_date', sinceDateStr)
      .range(offset, offset + 4999);

    if (!rankings || rankings.length === 0) break;

    for (const r of rankings) {
      const g = grouped.get(r.influencer_id) || { keywordIds: new Set(), ranks: [], top3: 0 };
      g.keywordIds.add(r.keyword_id);
      g.ranks.push(r.rank_position);
      if (r.is_integrated_top3) g.top3++;
      grouped.set(r.influencer_id, g);
    }

    offset += rankings.length;
    if (rankings.length < 5000) break;
  }

  console.log(`  ${grouped.size}명의 인플루언서 집계 데이터 수집됨`);

  if (isDryRun) {
    console.log('  [DRY RUN] DB 업데이트 생략');
    return;
  }

  let updated = 0;
  const entries = Array.from(grouped.entries());

  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    await Promise.all(batch.map(async ([id, g]) => {
      const avgRank = g.ranks.length > 0
        ? +(g.ranks.reduce((a, b) => a + b, 0) / g.ranks.length).toFixed(2) : null;
      const bestRank = g.ranks.length > 0 ? Math.min(...g.ranks) : null;

      await supabase.from('influencers').update({
        total_keywords: g.keywordIds.size,
        avg_rank: avgRank,
        best_rank: bestRank,
        integrated_top3_count: g.top3,
      }).eq('id', id);
      updated++;
    }));

    process.stdout.write(`\r  집계 업데이트: ${updated}/${grouped.size}`);
  }

  progress.phase3.done = true;
  saveProgress(progress);
  console.log(`\n  완료: ${updated}명 업데이트`);
}

// ─── 메인 ───

async function main() {
  console.log('=== 인플루언서 상세 데이터 벌크 크롤링 ===');
  console.log(`옵션: phase=${phaseOnly || 'all'}, limit=${limitCount === Infinity ? 'all' : limitCount}, resume=${isResume}, dry-run=${isDryRun}`);

  const progress = isResume ? loadProgress() : { phase1: { lastIndex: 0, done: false }, phase2: { lastIndex: 0, done: false }, phase3: { done: false } };

  const startTime = Date.now();

  if (!phaseOnly || phaseOnly === 1) await phase1(progress);
  if (!phaseOnly || phaseOnly === 2) await phase2(progress);
  if (!phaseOnly || phaseOnly === 3) await phase3(progress);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  console.log(`\n=== 전체 완료 (${min}분 ${sec}초) ===`);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
