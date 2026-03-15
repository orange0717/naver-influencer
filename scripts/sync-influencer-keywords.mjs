#!/usr/bin/env node
/**
 * 특정 인플루언서의 참여 키워드를 빠르게 동기화
 *
 * 3단계 전략:
 *   1단계: 프로필 페이지 HTML에서 즉시 20개 키워드 확보
 *   2단계: Feed API 병렬 스캔 (5~10개 동시, 100ms 딜레이)
 *
 * Usage:
 *   node scripts/sync-influencer-keywords.mjs orangelibrary
 *   node scripts/sync-influencer-keywords.mjs orangelibrary --category 도서
 *   node scripts/sync-influencer-keywords.mjs orangelibrary --all-categories
 *   node scripts/sync-influencer-keywords.mjs orangelibrary --concurrency 10
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env.local 읽기
const envPath = resolve(import.meta.dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const getEnv = (key) => envContent.match(new RegExp(`${key}=(.*)`))?.[1]?.trim();

const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));

const FEED_API = 'https://gw.in.naver.com/feed/query/v1/discover/collection/searched';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const naverId = process.argv[2];
if (!naverId) {
  console.error('Usage: node scripts/sync-influencer-keywords.mjs <naverId> [--category <cat>] [--all-categories] [--concurrency <n>]');
  process.exit(1);
}

const allCategories = process.argv.includes('--all-categories');
const catIndex = process.argv.indexOf('--category');
const targetCategory = catIndex >= 0 ? process.argv[catIndex + 1] : null;
const concurrencyIndex = process.argv.indexOf('--concurrency');
const CONCURRENCY = concurrencyIndex >= 0 ? parseInt(process.argv[concurrencyIndex + 1]) || 5 : 5;
const DELAY_MS = 100; // 병렬이므로 딜레이 축소

async function main() {
  const startTime = Date.now();
  console.log(`\n🔍 ${naverId}의 키워드 동기화 시작 (병렬 ${CONCURRENCY}개, 딜레이 ${DELAY_MS}ms)\n`);

  // 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, display_name, my_keyword_category, category')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    console.error(`인플루언서 "${naverId}"를 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`인플루언서: ${influencer.display_name} (${naverId})`);
  console.log(`카테고리: ${influencer.my_keyword_category || influencer.category}`);

  // ============================================
  // 1단계: 프로필 페이지에서 즉시 키워드 확보
  // ============================================
  console.log(`\n📄 1단계: 프로필 페이지에서 키워드 추출...\n`);
  const profileKeywords = await fetchProfileKeywords(naverId);

  let profileInserted = 0;
  if (profileKeywords.length > 0) {
    console.log(`  프로필에서 ${profileKeywords.length}개 키워드 발견 (총 ${profileKeywords[0]?.total || '?'}개 중)`);

    // DB에서 keyword 이름으로 매칭
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
            { influencer_id: influencer.id, keyword_id: kwMatch.id },
            { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true }
          );
        if (!error) profileInserted++;
      }
    }
    console.log(`  ✅ 프로필에서 ${profileInserted}개 DB 저장 완료\n`);
  } else {
    console.log(`  ⚠️ 프로필 키워드 추출 실패, Feed API 스캔으로 진행\n`);
  }

  // ============================================
  // 2단계: Feed API 병렬 스캔
  // ============================================
  console.log(`📡 2단계: Feed API 병렬 스캔 시작...\n`);

  // 스캔할 카테고리 결정
  let categories;
  if (allCategories) {
    const { data } = await supabase
      .from('keyword_challenges')
      .select('category')
      .eq('is_active', true);
    categories = [...new Set(data?.map(k => k.category))];
  } else {
    categories = [targetCategory || influencer.my_keyword_category || influencer.category];
  }

  console.log(`스캔 카테고리: ${categories.join(', ')}\n`);

  let totalScanned = 0;
  let totalFound = profileInserted;
  let totalInserted = profileInserted;

  for (const category of categories) {
    // 해당 카테고리의 모든 키워드 조회 - pagination으로 전부 가져오기
    const PAGE_SIZE = 1000;
    let keywords = [];
    let page = 0;
    let totalCount = 0;

    while (true) {
      const { data, count } = await supabase
        .from('keyword_challenges')
        .select('id, keyword, naver_keyword_id', { count: 'exact' })
        .eq('category', category)
        .eq('is_active', true)
        .not('naver_keyword_id', 'is', null)
        .order('participant_count', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (page === 0) totalCount = count || 0;
      if (!data || data.length === 0) break;
      keywords = keywords.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    console.log(`📂 ${category}: ${totalCount}개 키워드 스캔 시작 (${keywords.length}개 로드됨)`);

    if (keywords.length === 0) continue;

    let catFound = 0;
    let catScanned = 0;

    // 병렬 처리: CONCURRENCY개씩 동시에 스캔
    for (let i = 0; i < keywords.length; i += CONCURRENCY) {
      const batch = keywords.slice(i, i + CONCURRENCY);

      const results = await Promise.all(
        batch.map(kw => checkInfluencerInKeyword(kw.naver_keyword_id, naverId))
      );

      // 결과 처리
      for (let j = 0; j < batch.length; j++) {
        const kw = batch[j];
        catScanned++;
        totalScanned++;

        if (results[j]) {
          catFound++;
          totalFound++;

          const { error } = await supabase
            .from('influencer_keywords')
            .upsert(
              { influencer_id: influencer.id, keyword_id: kw.id },
              { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true }
            );

          if (!error) totalInserted++;
        }
      }

      // 진행 상황 표시
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const speed = (totalScanned / (Date.now() - startTime) * 1000).toFixed(1);
      process.stdout.write(`\r  [${catScanned}/${keywords.length}] ${catFound}개 발견 | ${speed}개/초 | ${elapsed}초 경과`);

      // Rate limiting (배치 간 딜레이)
      await sleep(DELAY_MS);
    }

    console.log(`\n  ✅ ${category}: ${catFound}개 키워드 발견\n`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n========================================`);
  console.log(`스캔 완료! (${elapsed}초 소요)`);
  console.log(`총 스캔: ${totalScanned}개`);
  console.log(`발견: ${totalFound}개`);
  console.log(`DB 저장: ${totalInserted}개`);
  console.log(`========================================\n`);
}

/**
 * 프로필 페이지 HTML에서 Apollo State를 파싱하여 키워드 추출
 * 즉시 20개 키워드 + 총 개수 확보 가능
 */
async function fetchProfileKeywords(urlId) {
  try {
    const url = `https://in.naver.com/${urlId}/challenge`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    // Apollo State 추출
    const marker = 'window.__APOLLO_STATE__ = ';
    const start = html.indexOf(marker);
    if (start === -1) return [];

    const jsonStart = start + marker.length;
    let depth = 0;
    let i = jsonStart;
    for (; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) break; }
    }

    const apollo = JSON.parse(html.slice(jsonStart, i + 1));

    // participatedKeywords 쿼리에서 total 가져오기
    const rootQuery = apollo['ROOT_QUERY'];
    let total = 0;
    for (const key of Object.keys(rootQuery || {})) {
      if (key.includes('participatedKeywords')) {
        total = rootQuery[key]?.paging?.total || 0;
        break;
      }
    }

    // ParticipatedKeywordView 엔트리 추출
    const keywords = [];
    for (const [key, val] of Object.entries(apollo)) {
      if (key.startsWith('ParticipatedKeywordView:') && val.name) {
        keywords.push({
          id: val.id,
          name: val.name,
          rank: val.rank,
          categoryId: val.categoryId,
          total,
        });
      }
    }

    return keywords;
  } catch (e) {
    console.error('  프로필 파싱 오류:', e.message);
    return [];
  }
}

/** Feed Discover API로 키워드에 인플루언서 참여 여부 확인 (10페이지 = 500명) */
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
        if (item.creator?.urlId === targetNaverId) {
          return true;
        }
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch {
      break;
    }
  }

  return false;
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
