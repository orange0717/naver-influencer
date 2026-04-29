#!/usr/bin/env node
/**
 * 공식 네이버 Open API 전용 블로그 ID 수집기 (policy-compliant)
 *
 * - Naver Search API (openapi.naver.com/v1/search/blog.json) 만 사용
 * - HTML 스크래핑 없음
 * - 투명한 User-Agent (봇임을 명시)
 * - 하루 쿼터의 80%만 사용 (20,000 / 25,000)
 * - 진행 상황 자동 저장 + 재개
 * - Ctrl+C 시 안전하게 종료
 *
 * 환경변수: NAVER_SEARCH_CLIENT_ID, NAVER_SEARCH_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY
 *
 * 실행:
 *   node scripts/polite-crawler.mjs            # 이어서 진행
 *   node scripts/polite-crawler.mjs --reset    # 진행 기록 초기화
 *   node scripts/polite-crawler.mjs --dry-run  # DB 저장 없이 테스트
 *   node scripts/polite-crawler.mjs --quota 5000  # 오늘 쿼터 5,000 으로 제한
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

// ─── 설정 ───

const CONFIG = {
  SEARCH_API: 'https://openapi.naver.com/v1/search/blog.json',
  DISPLAY: 100,
  MAX_START: 1000,          // 네이버 제한: start + display <= 1000
  DAILY_QUOTA: 20000,       // 하루 최대 쿼리 수 (25,000 한도의 80%)
  DELAY_MS: 250,            // 쿼리 간 간격 (초당 4회 이하)
  DELAY_ON_ERROR: 5000,
  MAX_RETRIES: 3,
  DB_BATCH_SIZE: 500,
  BOT_UA: 'NinflBot/1.0 (+https://ninfle.kr/bot-info)',
  PROGRESS_FILE: resolve(__dirname, '.polite-crawler-progress.json'),
  KEYWORDS_FILE: resolve(__dirname, 'keywords-all.json'),
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESET = args.includes('--reset');
const quotaArg = args.find(a => a.startsWith('--quota'));
const QUOTA = quotaArg ? parseInt(quotaArg.split('=')[1] || args[args.indexOf(quotaArg) + 1]) : CONFIG.DAILY_QUOTA;

// ─── 환경 검증 ───

const NAVER_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error('❌ NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 가 .env.local 에 필요합니다.');
  process.exit(1);
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. (--dry-run 으로는 없이도 실행 가능)');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── 키워드 풀 로드 ───

function loadKeywords() {
  if (existsSync(CONFIG.KEYWORDS_FILE)) {
    return JSON.parse(readFileSync(CONFIG.KEYWORDS_FILE, 'utf-8'));
  }
  // 기본 키워드 풀 (최소 시드) - 별도 파일 없을 때 사용
  return [
    '일상', '맛집', '카페', '여행', '뷰티', '패션', '육아', '다이어트',
    '운동', '요리', '집밥', '독서', '영화', '드라마', '게임', '반려견',
    '반려묘', '인테리어', '자취', '신혼', '직장인', '취업', '부업', '재테크',
    '주식', '부동산', '코딩', '디자인', '사진', '그림', '책', '공부',
    '시험', '자격증', '영어', '일본어', '중국어', '헬스', '필라테스', '요가',
    '등산', '캠핑', '낚시', '자전거', '골프', '테니스', '축구', '야구',
  ];
}

// ─── 진행 상황 ───

function loadProgress() {
  if (RESET || !existsSync(CONFIG.PROGRESS_FILE)) {
    return {
      date: '',
      todayQueries: 0,
      completedKeywords: [],
      currentKeyword: null,
      currentStart: 1,
      totalDiscovered: 0,
      totalSaved: 0,
      startedAt: new Date().toISOString(),
    };
  }
  return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8'));
}

function saveProgress(p) {
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── 유틸 ───

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function extractBlogIdFromUrl(url) {
  if (!url) return null;
  const m1 = url.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (m1 && !['PostView', 'PostList', 'NBlogProfileFeed'].includes(m1[1])) return m1[1];
  const m2 = url.match(/blogId=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

// ─── 네이버 Search API 호출 ───

async function searchNaver(keyword, start) {
  const url = `${CONFIG.SEARCH_API}?query=${encodeURIComponent(keyword)}&display=${CONFIG.DISPLAY}&start=${start}&sort=date`;
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
          'User-Agent': CONFIG.BOT_UA,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        // Retry-After 헤더가 있으면 그 값을 우선 존중한다.
        // 값은 초 단위 정수 또는 HTTP-date 중 하나.
        const retryAfter = res.headers.get('Retry-After');
        let waitMs = CONFIG.DELAY_ON_ERROR;
        if (retryAfter) {
          const asInt = parseInt(retryAfter, 10);
          if (Number.isFinite(asInt) && asInt > 0) {
            waitMs = Math.min(asInt * 1000, 60_000); // 최대 60초로 상한
          } else {
            const asDate = Date.parse(retryAfter);
            if (!Number.isNaN(asDate)) {
              waitMs = Math.max(0, Math.min(asDate - Date.now(), 60_000));
            }
          }
        }
        console.warn(`  [429] Rate limit, ${waitMs}ms 대기...`);
        await sleep(waitMs);
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`❌ 인증 오류 (${res.status}) — API 키 확인 필요`);
      }
      if (!res.ok) {
        if (attempt < CONFIG.MAX_RETRIES) {
          await sleep(CONFIG.DELAY_ON_ERROR);
          continue;
        }
        return null;
      }
      return res.json();
    } catch (e) {
      if (attempt < CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.DELAY_ON_ERROR);
        continue;
      }
      console.error('  [fetch error]', e.message);
      return null;
    }
  }
  return null;
}

// ─── DB 저장 (upsert, 중복 자동 처리) ───

async function saveToDb(records) {
  if (DRY_RUN || records.length === 0) return records.length;
  const { error, count } = await supabase
    .from('bloggers')
    .upsert(records, { onConflict: 'blog_id', ignoreDuplicates: true, count: 'exact' });
  if (error) {
    console.error('  [DB error]', error.message);
    return 0;
  }
  return count ?? records.length;
}

// ─── 메인 크롤링 루프 ───

async function run() {
  const keywords = loadKeywords();
  let progress = loadProgress();

  // 날짜 바뀌면 쿼터 리셋
  const today = todayKST();
  if (progress.date !== today) {
    progress.date = today;
    progress.todayQueries = 0;
  }

  const remainingQuota = Math.max(0, QUOTA - progress.todayQueries);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🤖 NinflBot/1.0 — 공식 Naver Open API 전용`);
  console.log(`📅 ${today}`);
  console.log(`📊 오늘 쿼터: ${progress.todayQueries}/${QUOTA} (남은: ${remainingQuota})`);
  console.log(`📦 누적 저장: ${progress.totalSaved.toLocaleString()}명`);
  console.log(`🔑 키워드 풀: ${keywords.length}개 (완료 ${progress.completedKeywords.length}개)`);
  if (DRY_RUN) console.log(`⚠️  DRY-RUN 모드 (DB 저장 안 함)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (remainingQuota <= 0) {
    console.log('✅ 오늘 쿼터 소진. 내일 다시 실행하세요.');
    return;
  }

  const pending = keywords.filter(k => !progress.completedKeywords.includes(k));
  if (pending.length === 0) {
    console.log('✅ 모든 키워드 완료. 키워드 풀을 확장하거나 재개 모드로 다시 실행하세요.');
    return;
  }

  // 우아한 종료
  let stopping = false;
  process.on('SIGINT', () => {
    console.log('\n⏸  중단 요청됨, 현재 상태 저장 후 종료합니다...');
    stopping = true;
  });

  let buffer = [];
  let queriesUsed = 0;

  outer: for (const keyword of pending) {
    if (stopping) break;
    progress.currentKeyword = keyword;
    const startFrom = progress.currentKeyword === keyword ? progress.currentStart : 1;
    console.log(`🔎 "${keyword}" (start=${startFrom})`);

    let keywordBlogIds = new Set();

    for (let start = startFrom; start <= CONFIG.MAX_START; start += CONFIG.DISPLAY) {
      if (stopping) break outer;
      if (progress.todayQueries + queriesUsed >= QUOTA) {
        console.log(`  ⏸  쿼터 도달, 중단`);
        progress.currentStart = start;
        break outer;
      }

      const data = await searchNaver(keyword, start);
      queriesUsed++;
      progress.currentStart = start + CONFIG.DISPLAY;

      if (!data || !data.items) {
        await sleep(CONFIG.DELAY_MS);
        continue;
      }

      for (const item of data.items) {
        const blogId = extractBlogIdFromUrl(item.bloggerlink || item.link);
        if (!blogId || keywordBlogIds.has(blogId)) continue;
        keywordBlogIds.add(blogId);
        buffer.push({
          blog_id: blogId,
          blog_name: (item.bloggername || '').slice(0, 200),
          discovered_via: 'search_api',
          discovered_keyword: keyword,
          last_post_date: item.postdate ? `${item.postdate.slice(0, 4)}-${item.postdate.slice(4, 6)}-${item.postdate.slice(6, 8)}` : null,
        });
      }

      if (buffer.length >= CONFIG.DB_BATCH_SIZE) {
        const saved = await saveToDb(buffer);
        progress.totalSaved += saved;
        progress.totalDiscovered += buffer.length;
        buffer = [];
        console.log(`  💾 batch 저장 (누적 ${progress.totalSaved.toLocaleString()})`);
      }

      // 진행 상황 주기 저장
      if (queriesUsed % 20 === 0) {
        progress.todayQueries = progress.todayQueries + queriesUsed;
        queriesUsed = 0;
        saveProgress(progress);
      }

      // 페이지네이션 끝
      if (data.items.length < CONFIG.DISPLAY) break;

      await sleep(CONFIG.DELAY_MS);
    }

    // 키워드 완료
    progress.completedKeywords.push(keyword);
    progress.currentStart = 1;
    console.log(`  ✅ "${keyword}" 완료 (이번 키워드 ${keywordBlogIds.size}개 수집)`);
  }

  // flush
  if (buffer.length > 0) {
    const saved = await saveToDb(buffer);
    progress.totalSaved += saved;
    progress.totalDiscovered += buffer.length;
  }
  progress.todayQueries = progress.todayQueries + queriesUsed;
  progress.currentKeyword = null;
  saveProgress(progress);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 오늘 사용 쿼터: ${progress.todayQueries}/${QUOTA}`);
  console.log(`📦 누적 저장: ${progress.totalSaved.toLocaleString()}명`);
  console.log(`✅ 키워드 완료: ${progress.completedKeywords.length}/${keywords.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

run().catch(e => {
  console.error('❌ 치명적 오류:', e);
  process.exit(1);
});
