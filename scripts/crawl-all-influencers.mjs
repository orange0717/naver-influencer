#!/usr/bin/env node
/**
 * 네이버 인플루언서 전체 일괄 크롤링 스크립트
 *
 * 사용법:
 *   node scripts/crawl-all-influencers.mjs
 *   node scripts/crawl-all-influencers.mjs --resume          # 중단 지점부터 재개
 *   node scripts/crawl-all-influencers.mjs --category travel  # 특정 카테고리만
 *   node scripts/crawl-all-influencers.mjs --dry-run          # API 호출만 (DB 저장 안 함)
 *   node scripts/crawl-all-influencers.mjs --top 500          # 카테고리별 상위 N개 키워드만
 *
 * 예상 소요: 전체 115,486 키워드 → 약 6-8시간 (rate limit 포함)
 *           상위 500개/카테고리 → 약 1-2시간
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 설정 ───

const CONFIG = {
  FEED_API_BASE: 'https://gw.in.naver.com/feed/query/v1',
  GRAPHQL_URL: 'https://in.naver.com/graphql',
  KW_API_BASE: 'https://gw.in.naver.com/keyword-challenge/api/v2',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  REFERER: 'https://in.naver.com/',

  // Rate limiting
  DELAY_BETWEEN_KEYWORDS: 600,     // ms between keyword API calls
  DELAY_BETWEEN_CATEGORIES: 2000,  // ms between category switches
  DELAY_ON_ERROR: 3000,            // ms on error before retry
  MAX_RETRIES: 3,

  // Batching
  KEYWORD_BATCH_SIZE: 50,          // keywords per category page
  INFLUENCER_PAGES: 2,             // max pages per keyword (50 per page)
  DB_UPSERT_BATCH: 50,             // DB upsert batch size

  // Progress file
  PROGRESS_FILE: resolve(__dirname, '.crawl-progress.json'),
};

// ─── 환경변수 로드 ───

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local 파일을 찾을 수 없습니다.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let val = trimmed.slice(eqIdx + 1);
    // 따옴표 제거 (Vercel CLI가 생성하는 형식)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

// ─── Supabase 클라이언트 ───

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// ─── 유틸 ───

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Referer': CONFIG.REFERER,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          ...(options.headers || {}),
        },
      });
      if (res.ok) return res;
      if (res.status === 429) {
        const wait = CONFIG.DELAY_ON_ERROR * (i + 1) * 2;
        console.warn(`  ⚠ Rate limited (429). ${wait}ms 대기...`);
        await sleep(wait);
        continue;
      }
      if (i === retries) return res;
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`  ⚠ Fetch error (attempt ${i + 1}): ${err.message}`);
    }
    await sleep(CONFIG.DELAY_ON_ERROR * (i + 1));
  }
  throw new Error(`Failed: ${url}`);
}

// ─── 진행 상태 관리 ───

function loadProgress() {
  try {
    if (existsSync(CONFIG.PROGRESS_FILE)) {
      return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { completedCategories: [], lastKeywordCursor: null, lastCategoryCode: null, stats: {} };
}

function saveProgress(progress) {
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Naver API 함수 ───

/** 전체 카테고리 목록 (GraphQL) */
async function fetchCategories() {
  const res = await fetchWithRetry(CONFIG.GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '{ keywordCategories { id name code keywordCount } }',
    }),
  });
  const json = await res.json();
  return json?.data?.keywordCategories || [];
}

/** 카테고리별 키워드 목록 (커서 기반 페이지네이션) */
async function fetchKeywords(categoryId, limit = 50, cursor) {
  let url = `${CONFIG.KW_API_BASE}/categories/${categoryId}/keywords?limit=${limit}&name=`;
  if (cursor) url += `&cursor=${cursor}`;

  const res = await fetchWithRetry(url);
  const json = await res.json();
  return {
    items: json?.data || [],
    nextCursor: json?.paging?.nextCursor ?? null,
    total: json?.paging?.total ?? 0,
  };
}

/** 키워드별 인플루언서 수집 (Feed Discover API, 최대 100명) */
async function fetchInfluencersByKeyword(keywordId) {
  const results = [];
  const seenIds = new Set();
  let cursor;

  for (let page = 0; page < CONFIG.INFLUENCER_PAGES; page++) {
    let url = `${CONFIG.FEED_API_BASE}/discover/collection/searched?keywordId=${keywordId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const items = json?.data || [];

      for (const item of items) {
        const c = item.creator;
        if (!c?.urlId || seenIds.has(c.urlId)) continue;
        seenIds.add(c.urlId);
        results.push({
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
          last_crawled_at: new Date().toISOString(),
        });
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch (err) {
      console.warn(`    ⚠ Feed API error for keyword ${keywordId}: ${err.message}`);
      break;
    }
  }

  return results;
}

// ─── DB 저장 ───

async function upsertInfluencers(influencers, dryRun = false) {
  if (dryRun || influencers.length === 0) return 0;

  let saved = 0;
  for (let i = 0; i < influencers.length; i += CONFIG.DB_UPSERT_BATCH) {
    const batch = influencers.slice(i, i + CONFIG.DB_UPSERT_BATCH);
    const { error } = await supabase
      .from('influencers')
      .upsert(batch, {
        onConflict: 'naver_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`    ❌ DB upsert error: ${error.message}`);
    } else {
      saved += batch.length;
    }
  }
  return saved;
}

// ─── 메인 크롤링 로직 ───

async function crawlCategory(category, topN, dryRun, progress) {
  const { id: categoryId, name, code, keywordCount } = category;
  const maxKeywords = topN > 0 ? Math.min(topN, keywordCount) : keywordCount;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📂 카테고리: ${name} (${code})`);
  console.log(`   키워드 ${keywordCount}개 중 ${maxKeywords}개 처리 예정`);
  console.log(`${'═'.repeat(60)}`);

  let cursor = null;
  let keywordsProcessed = 0;
  let newInfluencers = 0;
  let totalInfluencersFound = 0;

  // 이어하기: 마지막 커서부터 재개
  if (progress.lastCategoryCode === code && progress.lastKeywordCursor) {
    cursor = progress.lastKeywordCursor;
    keywordsProcessed = progress.stats?.[code]?.keywordsProcessed || 0;
    console.log(`   ↪ 이전 진행 지점에서 재개 (${keywordsProcessed}개 처리됨)`);
  }

  const allInfluencersBatch = [];

  while (keywordsProcessed < maxKeywords) {
    // 키워드 페이지 가져오기
    const kwResult = await fetchKeywords(categoryId, CONFIG.KEYWORD_BATCH_SIZE, cursor);
    const keywords = kwResult.items;

    if (keywords.length === 0) break;

    for (const kw of keywords) {
      if (keywordsProcessed >= maxKeywords) break;

      // 키워드별 인플루언서 수집
      const influencers = await fetchInfluencersByKeyword(kw.id);
      totalInfluencersFound += influencers.length;

      if (influencers.length > 0) {
        allInfluencersBatch.push(...influencers);
      }

      keywordsProcessed++;

      // 진행 로그 (50개마다)
      if (keywordsProcessed % 50 === 0 || influencers.length > 30) {
        const pct = ((keywordsProcessed / maxKeywords) * 100).toFixed(1);
        console.log(`   [${pct}%] ${keywordsProcessed}/${maxKeywords} 키워드 | "${kw.name}" → ${influencers.length}명 | 배치 누적: ${allInfluencersBatch.length}명`);
      }

      // 배치 저장 (500명 이상 쌓이면)
      if (allInfluencersBatch.length >= 500) {
        // 중복 제거
        const uniqueMap = new Map();
        for (const inf of allInfluencersBatch) {
          uniqueMap.set(inf.naver_id, inf);
        }
        const uniqueList = Array.from(uniqueMap.values());
        const saved = await upsertInfluencers(uniqueList, dryRun);
        newInfluencers += saved;
        console.log(`   💾 ${uniqueList.length}명 저장 (중복 제거 후) | 누적 저장: ${newInfluencers}`);
        allInfluencersBatch.length = 0;
      }

      // 진행 상태 저장 (100개마다)
      if (keywordsProcessed % 100 === 0) {
        progress.lastCategoryCode = code;
        progress.lastKeywordCursor = kwResult.nextCursor || cursor;
        progress.stats[code] = { keywordsProcessed, totalInfluencersFound, newInfluencers };
        saveProgress(progress);
      }

      await sleep(CONFIG.DELAY_BETWEEN_KEYWORDS);
    }

    cursor = kwResult.nextCursor;
    if (!cursor) break;
  }

  // 남은 배치 저장
  if (allInfluencersBatch.length > 0) {
    const uniqueMap = new Map();
    for (const inf of allInfluencersBatch) {
      uniqueMap.set(inf.naver_id, inf);
    }
    const uniqueList = Array.from(uniqueMap.values());
    const saved = await upsertInfluencers(uniqueList, dryRun);
    newInfluencers += saved;
    console.log(`   💾 최종 배치: ${uniqueList.length}명 저장`);
  }

  // 카테고리 완료
  progress.completedCategories.push(code);
  progress.lastCategoryCode = null;
  progress.lastKeywordCursor = null;
  progress.stats[code] = { keywordsProcessed, totalInfluencersFound, newInfluencers, completed: true };
  saveProgress(progress);

  console.log(`\n   ✅ ${name} 완료: ${keywordsProcessed} 키워드, ${totalInfluencersFound}명 발견, ${newInfluencers}명 저장`);

  return { keywordsProcessed, totalInfluencersFound, newInfluencers };
}

// ─── CLI 파싱 ───

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    resume: false,
    category: null,
    dryRun: false,
    topN: 0,     // 0 = 전체
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--resume':
        options.resume = true;
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--top':
        options.topN = parseInt(args[++i]) || 0;
        break;
      case '--help':
        console.log(`
사용법: node scripts/crawl-all-influencers.mjs [옵션]

옵션:
  --resume          중단 지점부터 재개
  --category CODE   특정 카테고리만 (예: travel, beauty, food)
  --top N           카테고리별 상위 N개 키워드만
  --dry-run         API 호출만 (DB 저장 안 함)
  --help            도움말
        `);
        process.exit(0);
    }
  }

  return options;
}

// ─── 메인 ───

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  네이버 인플루언서 전체 크롤링 스크립트      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  if (options.dryRun) console.log('🔍 DRY RUN 모드 (DB 저장 안 함)');
  if (options.topN > 0) console.log(`📊 카테고리별 상위 ${options.topN}개 키워드만 처리`);

  // 진행 상태 로드
  let progress = options.resume ? loadProgress() : { completedCategories: [], lastKeywordCursor: null, lastCategoryCode: null, stats: {} };

  if (options.resume && progress.completedCategories.length > 0) {
    console.log(`↪ 이전 진행 재개: ${progress.completedCategories.length}개 카테고리 완료됨`);
  }

  // 카테고리 목록 가져오기
  console.log('\n📡 카테고리 목록 조회 중...');
  const categories = await fetchCategories();
  console.log(`   ${categories.length}개 카테고리, 총 ${categories.reduce((s, c) => s + c.keywordCount, 0).toLocaleString()}개 키워드`);

  // 기존 인플루언서 수 확인
  const { count: existingCount } = await supabase
    .from('influencers')
    .select('id', { count: 'exact', head: true });
  console.log(`   현재 DB 인플루언서: ${(existingCount || 0).toLocaleString()}명`);

  // 필터링
  let targetCategories = categories;
  if (options.category) {
    targetCategories = categories.filter(c => c.code === options.category);
    if (targetCategories.length === 0) {
      console.error(`❌ 카테고리 "${options.category}"를 찾을 수 없습니다.`);
      console.log(`   사용 가능: ${categories.map(c => c.code).join(', ')}`);
      process.exit(1);
    }
  }

  // 이미 완료된 카테고리 건너뛰기
  if (options.resume) {
    targetCategories = targetCategories.filter(c => !progress.completedCategories.includes(c.code));
    if (targetCategories.length === 0) {
      console.log('\n✅ 모든 카테고리가 이미 완료되었습니다!');
      process.exit(0);
    }
  }

  console.log(`\n🎯 처리할 카테고리: ${targetCategories.length}개`);
  for (const cat of targetCategories) {
    console.log(`   - ${cat.name} (${cat.code}): ${cat.keywordCount.toLocaleString()}개 키워드`);
  }

  // 크롤링 시작
  const totals = { keywords: 0, found: 0, saved: 0 };

  for (let i = 0; i < targetCategories.length; i++) {
    const cat = targetCategories[i];
    console.log(`\n[${i + 1}/${targetCategories.length}]`);

    try {
      const result = await crawlCategory(cat, options.topN, options.dryRun, progress);
      totals.keywords += result.keywordsProcessed;
      totals.found += result.totalInfluencersFound;
      totals.saved += result.newInfluencers;
    } catch (err) {
      console.error(`\n❌ ${cat.name} 처리 중 치명적 에러: ${err.message}`);
      console.log('   진행 상태가 저장되었습니다. --resume 로 재개 가능합니다.');
      saveProgress(progress);
      break;
    }

    if (i < targetCategories.length - 1) {
      await sleep(CONFIG.DELAY_BETWEEN_CATEGORIES);
    }
  }

  // 최종 DB 인플루언서 수 확인
  const { count: finalCount } = await supabase
    .from('influencers')
    .select('id', { count: 'exact', head: true });

  // 결과 요약
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║               크롤링 완료                    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  소요 시간:     ${elapsed}분`);
  console.log(`║  처리 키워드:   ${totals.keywords.toLocaleString()}개`);
  console.log(`║  발견 인플루언서: ${totals.found.toLocaleString()}명 (중복 포함)`);
  console.log(`║  DB 저장:       ${totals.saved.toLocaleString()}명`);
  console.log(`║  최종 DB 총원:  ${(finalCount || 0).toLocaleString()}명`);
  console.log('╚══════════════════════════════════════════════╝');

  // 진행 파일 정리
  if (progress.completedCategories.length >= categories.length) {
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync(CONFIG.PROGRESS_FILE);
      console.log('\n🧹 진행 파일 정리 완료');
    } catch { /* ignore */ }
  }
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
