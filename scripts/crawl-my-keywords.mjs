#!/usr/bin/env node
/**
 * 특정 인플루언서의 키워드 챌린지 데이터를 수집하는 스크립트
 *
 * 사용법:
 *   node scripts/crawl-my-keywords.mjs                    # 기본: orangelibrary
 *   node scripts/crawl-my-keywords.mjs --naver-id myid    # 특정 ID
 *   node scripts/crawl-my-keywords.mjs --all-categories   # 전체 카테고리 (기본: 본인 카테고리만)
 *
 * 동작 순서:
 *   1. 해당 인플루언서의 카테고리 키워드 목록을 네이버에서 수집 (keyword_challenges)
 *   2. 각 키워드의 Feed Discover API에서 해당 인플루언서가 참여 중인지 확인 (influencer_keywords)
 *   3. 매칭된 키워드에 대해 search.naver.com에서 순위 스크래핑 (keyword_rankings)
 */

import * as cheerio from 'cheerio';
import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const GRAPHQL_URL = 'https://in.naver.com/graphql';
const REST_API_BASE = 'https://gw.in.naver.com/keyword-challenge/api/v2';
const FEED_API_BASE = 'https://gw.in.naver.com/feed/query/v1';
const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, options = {}, retries = 2) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'ko-KR,ko;q=0.9',
    ...options.headers,
  };
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && i < retries) {
        console.log(`  ⏳ ${res.status} — ${(i + 1) * 2}초 대기 후 재시도...`);
        await sleep(2000 * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${url.substring(0, 80)}`);
    } catch (err) {
      if (i === retries) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

// ── CLI 파싱 ──
const args = process.argv.slice(2);
const TARGET_NAVER_ID = args.includes('--naver-id')
  ? args[args.indexOf('--naver-id') + 1]
  : 'orangelibrary';
const ALL_CATEGORIES = args.includes('--all-categories');

console.log(`\n🔍 @${TARGET_NAVER_ID} 키워드 크롤링 시작\n`);

// ── STEP 0: DB에서 인플루언서 레코드 확인 ──
async function getInfluencer() {
  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .eq('naver_id', TARGET_NAVER_ID)
    .single();

  if (error || !data) {
    console.error(`❌ DB에서 @${TARGET_NAVER_ID}를 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`✅ 인플루언서: ${data.display_name} (@${data.naver_id})`);
  console.log(`   카테고리: ${data.category || data.my_keyword_category || '(없음)'}`);
  console.log(`   팬: ${data.subscriber_count || 0} · 팔로워: ${data.total_follower_count || 0}\n`);
  return data;
}

// ── STEP 1: 네이버에서 카테고리 목록 + 키워드 수집 ──
async function fetchCategories() {
  const res = await fetchRetry(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://in.naver.com/' },
    body: JSON.stringify({ query: '{ keywordCategories { id name code keywordCount } }' }),
  });
  const json = await res.json();
  return json?.data?.keywordCategories || [];
}

async function fetchKeywordsForCategory(categoryId, maxPages = 999) {
  const keywords = [];
  let cursor;
  let page = 0;

  while (page < maxPages) {
    const params = new URLSearchParams({ name: '', limit: '50' });
    if (cursor) params.set('cursor', cursor);

    const url = `${REST_API_BASE}/categories/${categoryId}/keywords?${params}`;
    const res = await fetchRetry(url, { headers: { 'Referer': 'https://in.naver.com/' } });
    const json = await res.json();
    const items = json?.data || [];
    if (items.length === 0) break;

    keywords.push(...items);
    cursor = json?.paging?.nextCursor;
    page++;
    if (!cursor || items.length < 50) break;
    await sleep(300);
  }

  return keywords;
}

// ── STEP 2: Feed Discover API로 해당 인플루언서가 참여하는 키워드 찾기 ──
async function checkInfluencerInKeyword(keywordId, naverId) {
  const allCreators = [];
  let cursor;

  // 최대 3페이지 (150명) 확인
  for (let page = 0; page < 3; page++) {
    let url = `${FEED_API_BASE}/discover/collection/searched?keywordId=${keywordId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchRetry(url, { headers: { 'Referer': 'https://in.naver.com/' } });
      const json = await res.json();
      const items = json?.data || [];

      for (const item of items) {
        if (item.creator?.urlId) {
          allCreators.push(item.creator);
          if (item.creator.urlId === naverId) {
            return { found: true, creators: allCreators };
          }
        }
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch {
      break;
    }
  }

  return { found: false, creators: allCreators };
}

// ── STEP 3: search.naver.com에서 키워드 순위 스크래핑 ──
function parseInfluencerRankings(html) {
  const $ = cheerio.load(html);
  const rankings = [];
  const items = $('li.keyword_bx._item');

  items.each((i, el) => {
    const $el = $(el);
    const name = $el.find('.name.elss .txt').first().text().trim();
    if (!name) return;

    const profileLink = $el.find('a[href*="in.naver.com"]').first().attr('href') || '';
    const naverIdMatch = profileLink.match(/in\.naver\.com\/([^/?#]+)/);
    const naverId = naverIdMatch ? naverIdMatch[1] : '';

    const fanText = $el.find('._fan_count').text().trim();
    const fanMatch = fanText.match(/([\d,.]+)\s*만/);
    const fanCount = fanMatch
      ? Math.round(parseFloat(fanMatch[1].replace(/,/g, '')) * 10000)
      : parseInt((fanText.match(/([\d,]+)/) || ['0', '0'])[1].replace(/,/g, ''), 10);

    const postTitle = $el.find('.elss.tit').text().trim() || null;

    rankings.push({
      rank: i + 1,
      name,
      naverId,
      fanCount,
      postTitle,
    });
  });

  return rankings;
}

// ── 메인 실행 ──
async function main() {
  const influencer = await getInfluencer();
  const influencerCategory = influencer.category || influencer.my_keyword_category || '도서';

  // 1. 카테고리 + 키워드 수집
  console.log('📂 Step 1: 카테고리별 키워드 수집...');
  const allCategories = await fetchCategories();
  if (allCategories.length === 0) {
    console.error('❌ 네이버에서 카테고리를 가져올 수 없습니다.');
    process.exit(1);
  }
  console.log(`   총 ${allCategories.length}개 카테고리 발견`);

  // 본인 카테고리만 또는 전체
  const targetCategories = ALL_CATEGORIES
    ? allCategories
    : allCategories.filter(c => c.name === influencerCategory);

  if (targetCategories.length === 0) {
    console.log(`   ⚠️ "${influencerCategory}" 카테고리를 찾을 수 없어 전체 카테고리로 진행합니다.`);
    targetCategories.push(...allCategories);
  }

  console.log(`   크롤 대상: ${targetCategories.map(c => c.name).join(', ')}\n`);

  const matchedKeywords = []; // { keyword, keywordId, categoryName, dbKeywordId }
  let totalKeywordsScanned = 0;

  for (const cat of targetCategories) {
    console.log(`\n📁 [${cat.name}] 키워드 수집 중... (총 ${cat.keywordCount}개)`);
    const keywords = await fetchKeywordsForCategory(cat.id);
    console.log(`   가져온 키워드: ${keywords.length}개`);

    // keyword_challenges에 저장
    if (keywords.length > 0) {
      for (let i = 0; i < keywords.length; i += 50) {
        const batch = keywords.slice(i, i + 50);
        const rows = batch.map(kw => ({
          keyword: kw.name,
          keyword_clean: kw.name.replace(/\s+/g, '').toLowerCase(),
          category: cat.name,
          naver_keyword_id: kw.id,
          participant_count: kw.participantCount ?? 0,
          is_new: kw.recentAdded || false,
          is_active: true,
          last_crawled_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('keyword_challenges')
          .upsert(rows, { onConflict: 'keyword_clean' });

        if (error) {
          console.error(`   ❌ DB 저장 오류:`, error.message);
        }
      }
    }

    // 2. 각 키워드에서 @targetNaverId 참여 여부 확인
    console.log(`   🔎 @${TARGET_NAVER_ID} 키워드 매칭 확인 중...`);

    for (let ki = 0; ki < keywords.length; ki++) {
      const kw = keywords[ki];
      totalKeywordsScanned++;

      if (ki % 20 === 0 && ki > 0) {
        process.stdout.write(`   진행: ${ki}/${keywords.length} (매칭 ${matchedKeywords.length}개)\r`);
      }

      const { found } = await checkInfluencerInKeyword(kw.id, TARGET_NAVER_ID);

      if (found) {
        // DB에서 keyword_challenges.id 조회
        const { data: dbKw } = await supabase
          .from('keyword_challenges')
          .select('id')
          .eq('keyword_clean', kw.name.replace(/\s+/g, '').toLowerCase())
          .single();

        if (dbKw) {
          matchedKeywords.push({
            keyword: kw.name,
            keywordNaverId: kw.id,
            categoryName: cat.name,
            dbKeywordId: dbKw.id,
            participantCount: kw.participantCount,
          });
          console.log(`   ✅ 매칭: "${kw.name}" (참여자 ${kw.participantCount}명)`);
        }
      }

      await sleep(600);
    }

    console.log(`   ${cat.name} 완료: ${keywords.length}개 스캔`);
    await sleep(1000);
  }

  console.log(`\n\n🎯 Step 2 완료: ${totalKeywordsScanned}개 키워드 스캔 → ${matchedKeywords.length}개 매칭\n`);

  if (matchedKeywords.length === 0) {
    console.log('⚠️ 매칭된 키워드가 없습니다. 다른 카테고리도 검색하려면 --all-categories 옵션을 사용하세요.');
    process.exit(0);
  }

  // 3. influencer_keywords에 저장
  console.log('💾 Step 3: influencer_keywords 저장...');
  const joinRows = matchedKeywords.map(mk => ({
    influencer_id: influencer.id,
    keyword_id: mk.dbKeywordId,
  }));

  for (let i = 0; i < joinRows.length; i += 50) {
    const batch = joinRows.slice(i, i + 50);
    const { error } = await supabase
      .from('influencer_keywords')
      .upsert(batch, { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true });
    if (error) console.error('   ❌ influencer_keywords 저장 오류:', error.message);
  }
  console.log(`   ✅ ${joinRows.length}개 키워드 연결 저장 완료\n`);

  // 4. 각 매칭 키워드의 순위 크롤링
  console.log('📊 Step 4: 키워드 순위 크롤링...');
  const snapshotDate = new Date().toISOString().slice(0, 10);
  let rankingsProcessed = 0;
  let myRankCount = 0;

  for (const mk of matchedKeywords) {
    try {
      const url = `${NAVER_SEARCH_URL}?where=influencer&query=${encodeURIComponent(mk.keyword)}`;
      const res = await fetchRetry(url);
      const html = await res.text();
      const rankings = parseInfluencerRankings(html);

      if (rankings.length === 0) {
        console.log(`   ⚠️ "${mk.keyword}" — 순위 결과 없음`);
        await sleep(1000);
        continue;
      }

      // 각 순위 인플루언서를 DB에 저장
      for (const rank of rankings) {
        if (!rank.naverId) continue;

        // influencers upsert
        const { data: inf } = await supabase
          .from('influencers')
          .upsert({
            naver_id: rank.naverId,
            display_name: rank.name,
            profile_url: `https://in.naver.com/${rank.naverId}`,
            fan_count: rank.fanCount || 0,
            last_crawled_at: new Date().toISOString(),
          }, { onConflict: 'naver_id' })
          .select('id')
          .single();

        if (!inf) continue;

        // keyword_rankings upsert
        await supabase.from('keyword_rankings').upsert({
          keyword_id: mk.dbKeywordId,
          influencer_id: inf.id,
          rank_position: rank.rank,
          previous_rank: null,
          rank_change: 0,
          fan_count: rank.fanCount || 0,
          is_integrated_top3: rank.rank <= 3,
          latest_post_title: rank.postTitle,
          snapshot_date: snapshotDate,
          crawled_at: new Date().toISOString(),
        }, { onConflict: 'keyword_id,influencer_id,snapshot_date' });

        // 내 순위 확인
        if (rank.naverId === TARGET_NAVER_ID) {
          myRankCount++;
          console.log(`   🏆 "${mk.keyword}" — 내 순위: ${rank.rank}위 (총 ${rankings.length}명 중)`);
        }
      }

      rankingsProcessed++;
      await sleep(1200);
    } catch (err) {
      console.error(`   ❌ "${mk.keyword}" 순위 크롤링 오류:`, err.message);
      await sleep(1000);
    }
  }

  // 5. influencers 테이블 집계 업데이트
  console.log('\n📈 Step 5: 인플루언서 통계 집계...');

  const { data: myRankings } = await supabase
    .from('keyword_rankings')
    .select('rank_position, is_integrated_top3')
    .eq('influencer_id', influencer.id)
    .eq('snapshot_date', snapshotDate);

  if (myRankings && myRankings.length > 0) {
    const totalKw = myRankings.length;
    const avgRank = myRankings.reduce((s, r) => s + r.rank_position, 0) / totalKw;
    const bestRank = Math.min(...myRankings.map(r => r.rank_position));
    const top3 = myRankings.filter(r => r.is_integrated_top3).length;

    await supabase.from('influencers').update({
      total_keywords: totalKw,
      avg_rank: Math.round(avgRank * 100) / 100,
      best_rank: bestRank,
      integrated_top3_count: top3,
    }).eq('id', influencer.id);

    console.log(`   총 키워드: ${totalKw}, 평균순위: ${avgRank.toFixed(1)}, 최고순위: ${bestRank}위, TOP3: ${top3}개`);
  }

  // 완료!
  console.log('\n' + '═'.repeat(50));
  console.log(`🎉 크롤링 완료!`);
  console.log(`   스캔한 키워드: ${totalKeywordsScanned}개`);
  console.log(`   매칭된 키워드: ${matchedKeywords.length}개`);
  console.log(`   순위 크롤링: ${rankingsProcessed}개`);
  console.log(`   내 순위 발견: ${myRankCount}개`);
  console.log('═'.repeat(50) + '\n');

  // 매칭 키워드 목록 출력
  console.log('📋 매칭된 키워드 목록:');
  for (const mk of matchedKeywords) {
    console.log(`   [${mk.categoryName}] ${mk.keyword} (참여자 ${mk.participantCount}명)`);
  }
  console.log('');
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
