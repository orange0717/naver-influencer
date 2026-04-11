#!/usr/bin/env node
/**
 * 네이버 블로그 전체 크롤링 스크립트
 *
 * 방법 1: 네이버 검색 API (blog.json) — 키워드별 블로그 검색
 * 방법 2: 네이버 블로그 HTML 크롤링 — 카테고리별 최신글에서 블로그ID 추출
 *
 * 사용법:
 *   node scripts/crawl-bloggers.mjs                    # 전체 실행 (검색 + 카테고리)
 *   node scripts/crawl-bloggers.mjs --mode search      # 검색 API만
 *   node scripts/crawl-bloggers.mjs --mode category    # 카테고리 크롤링만
 *   node scripts/crawl-bloggers.mjs --mode profile     # 프로필 보강 (이미 수집된 ID에 이름/포스트수 추가)
 *   node scripts/crawl-bloggers.mjs --limit 1000       # 최대 1000개 키워드
 *   node scripts/crawl-bloggers.mjs --resume            # 중단 지점부터 재개
 *   node scripts/crawl-bloggers.mjs --dry-run           # DB 저장 없이 테스트
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 설정 ───

const CONFIG = {
  // 네이버 검색 API
  SEARCH_API: 'https://openapi.naver.com/v1/search/blog.json',
  SEARCH_DISPLAY: 100,   // 한 번에 100개 결과
  SEARCH_MAX_START: 1000, // 최대 start 값 (네이버 제한)

  // 네이버 블로그 카테고리
  BLOG_CATEGORY_URL: 'https://blog.naver.com/PostList.naver',

  // 블로그 프로필
  BLOG_PROFILE_URL: 'https://blog.naver.com/NBlogProfileFeed.naver',

  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

  DELAY_MS: 200,           // API 호출 간격
  DELAY_ON_ERROR: 3000,    // 에러 시 대기
  MAX_RETRIES: 3,
  DB_BATCH_SIZE: 200,      // DB 일괄 저장 크기
  SAVE_INTERVAL: 100,      // 진행상황 저장 간격

  PROGRESS_FILE: resolve(__dirname, '.crawl-bloggers-progress.json'),
};

// ─── 인기 키워드 목록 (검색 크롤링용) ───

const SEARCH_KEYWORDS = [
  // 일상/생활
  '일상', '일기', '오늘의기록', '하루', '주말', '데일리', '소소한일상', '직장인일상',
  '주부일상', '자취일상', '육아일기', '신혼일기', '연애일기', '대학생일상',
  // 맛집/카페
  '맛집', '카페', '맛집추천', '서울맛집', '부산맛집', '대구맛집', '인천맛집', '대전맛집',
  '광주맛집', '제주맛집', '경기맛집', '성수맛집', '강남맛집', '홍대맛집', '이태원맛집',
  '판교맛집', '수원맛집', '분당맛집', '일산맛집', '파주맛집',
  '카페추천', '브런치카페', '디저트카페', '감성카페',
  // 여행
  '여행', '국내여행', '해외여행', '제주여행', '부산여행', '경주여행', '강릉여행',
  '속초여행', '여수여행', '통영여행', '전주여행', '춘천여행', '양양여행',
  '일본여행', '태국여행', '베트남여행', '유럽여행', '미국여행',
  '호텔추천', '펜션추천', '글램핑', '캠핑',
  // 뷰티/패션
  '뷰티', '화장품', '스킨케어', '메이크업', '향수', '네일', '피부관리',
  '패션', 'OOTD', '코디', '쇼핑', '데일리룩', '봄코디', '여름코디', '가을코디', '겨울코디',
  '신상', '명품', '가방', '구두',
  // 육아/교육
  '육아', '아기', '임신', '출산', '태교', '영유아', '초등학생', '중학생',
  '교육', '공부', '학원', '과외', '수능', '영어공부', '독서', '자기계발',
  // IT/테크
  'IT', '프로그래밍', '코딩', '개발', '앱', '스마트폰', '갤럭시', '아이폰',
  '노트북', '태블릿', '가전', '리뷰', '언박싱',
  // 재테크/부동산
  '재테크', '주식', '투자', '부동산', '아파트', '전세', '월세', '청약',
  '저축', '적금', '연금', '보험', '경제',
  // 건강/운동
  '건강', '다이어트', '운동', '헬스', '필라테스', '요가', '러닝', '등산',
  '수영', '골프', '축구', '야구', '홈트', '식단',
  // 음식/요리
  '요리', '레시피', '집밥', '반찬', '베이킹', '홈베이킹', '한식', '양식',
  '중식', '일식', '간식', '도시락', '밀키트',
  // 인테리어/라이프
  '인테리어', '집꾸미기', '가구', '수납', '정리', '이사', '셀프인테리어',
  '원룸', '신혼집', '아파트인테리어',
  // 반려동물
  '강아지', '고양이', '반려동물', '펫', '강아지간식', '고양이사료', '펫스타그램',
  // 문화/취미
  '영화', '드라마', '넷플릭스', '책', '독서', '음악', '공연', '전시',
  '게임', '그림', '캘리그라피', '사진', '카메라', 'DSLR',
  // 자동차
  '자동차', '중고차', '신차', '전기차', '현대', '기아', '테슬라', '벤츠', 'BMW',
  '수입차', '국산차', '드라이브', '차량관리',
  // 결혼/웨딩
  '결혼', '웨딩', '결혼준비', '웨딩홀', '스드메', '허니문', '혼수', '예식장',
  // 취업/직장
  '취업', '이직', '면접', '자소서', '직장생활', '퇴사', '프리랜서', '부업',
  '투잡', 'N잡', '재택근무', '사업',
  // 식물/가드닝
  '식물', '가드닝', '화분', '다육이', '꽃', '정원', '텃밭',
  // 지역
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기도', '강원도', '충청도', '전라도', '경상도', '제주도',
  '강남', '잠실', '여의도', '마포', '용산', '송파', '서초', '종로', '영등포',
  '해운대', '서면', '남포동', '동성로', '상무지구', '둔산동',
  // 계절/시즌
  '봄', '여름', '가을', '겨울', '벚꽃', '단풍', '크리스마스', '설날', '추석',
  '여름휴가', '겨울여행', '가을여행',
  // 쇼핑
  '쿠팡', '다이소', '올리브영', '이마트', '코스트코', '아울렛', '백화점',
  // 블로그 관련
  '블로그', '포스팅', '블로그수익', '애드포스트', '블로거', '체험단', '원고료',
  '블로그챌린지', '인플루언서', '네이버인플루언서',
  // 기타
  '후기', '추천', '비교', '정보', '꿀팁', '노하우', '소개', '리뷰',
];

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

const NAVER_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET;

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
          ...options.headers,
        },
      });
      clearTimeout(timeout);
      if (res.status === 429) {
        console.warn(`  [429] Rate limit, ${CONFIG.DELAY_ON_ERROR}ms 대기...`);
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
  return null;
}

// ─── 진행상황 관리 ───

function loadProgress() {
  if (existsSync(CONFIG.PROGRESS_FILE)) {
    return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8'));
  }
  return { completedKeywords: [], discoveredCount: 0, mode: null };
}

function saveProgress(progress) {
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── 블로그ID 추출 ───

function extractBlogIdFromUrl(url) {
  if (!url) return null;
  // https://blog.naver.com/blogid/12345 형태
  const m1 = url.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (m1 && m1[1] !== 'PostView' && m1[1] !== 'PostList') return m1[1];
  // blogId 파라미터
  const m2 = url.match(/blogId=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

// ─── 방법 1: 네이버 검색 API ───

async function searchBlogsByKeyword(keyword) {
  const blogIds = new Set();

  for (let start = 1; start <= CONFIG.SEARCH_MAX_START; start += CONFIG.SEARCH_DISPLAY) {
    const url = `${CONFIG.SEARCH_API}?query=${encodeURIComponent(keyword)}&display=${CONFIG.SEARCH_DISPLAY}&start=${start}&sort=date`;

    try {
      const res = await fetchWithRetry(url, {
        headers: {
          'X-Naver-Client-Id': NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
      });

      if (!res || !res.ok) {
        if (res?.status === 429) {
          console.warn(`  [검색] Rate limit at start=${start}, 5초 대기...`);
          await sleep(5000);
          continue;
        }
        break;
      }

      const data = await res.json();
      const items = data.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const blogId = extractBlogIdFromUrl(item.bloggerlink || item.link);
        if (blogId) blogIds.add(blogId);
      }

      // 더 이상 결과가 없으면 중단
      if (items.length < CONFIG.SEARCH_DISPLAY) break;
      if (start + CONFIG.SEARCH_DISPLAY > data.total) break;

      await sleep(CONFIG.DELAY_MS);
    } catch (err) {
      console.error(`  [검색] 에러 (keyword=${keyword}, start=${start}):`, err.message);
      break;
    }
  }

  return [...blogIds];
}

// ─── 방법 2: 블로그 HTML 크롤링 (최신글에서 블로그ID 추출) ───

async function crawlBlogCategory(categoryKeyword, page = 1) {
  const blogIds = new Set();
  const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(categoryKeyword)}&start=${(page - 1) * 10 + 1}`;

  try {
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) return [];

    const html = await res.text();
    // blog.naver.com/blogid 패턴 추출
    const matches = html.matchAll(/blog\.naver\.com\/([a-zA-Z0-9_-]{2,30})/g);
    for (const match of matches) {
      const id = match[1];
      // 시스템 경로 제외
      if (!['PostView', 'PostList', 'NBlogTop', 'BlogDirectoryView', 'prologue',
            'SectionPostList', 'PostTitleListAsync', 'static', 'common'].includes(id)) {
        blogIds.add(id);
      }
    }
  } catch (err) {
    console.error(`  [카테고리] 에러 (${categoryKeyword}, page=${page}):`, err.message);
  }

  return [...blogIds];
}

// ─── 블로그 프로필 가져오기 ───

async function fetchBlogProfile(blogId) {
  try {
    // 블로그 메인 페이지에서 이름/포스트수 추출
    const url = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=1&countPerPage=1`;
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) return null;

    const html = await res.text();

    // 블로그 이름 추출
    let blogName = null;
    const nameMatch = html.match(/<title>([^<]+)<\/title>/);
    if (nameMatch) {
      blogName = nameMatch[1].replace(/\s*:\s*네이버\s*블로그$/, '').trim();
      if (blogName.length > 100) blogName = blogName.substring(0, 100);
    }

    // 전체 포스트 수 추출
    let totalPosts = 0;
    const countMatch = html.match(/totalCount['":\s]+(\d+)/);
    if (countMatch) totalPosts = parseInt(countMatch[1]);

    // 카테고리 추출 (있는 경우)
    let category = null;
    const catMatch = html.match(/blog2_series[^>]*>([^<]+)/);
    if (catMatch) category = catMatch[1].trim();

    return { blogName, totalPosts, category };
  } catch {
    return null;
  }
}

// ─── DB 저장 ───

async function saveBloggersBatch(bloggers, dryRun = false) {
  if (bloggers.length === 0) return 0;
  if (dryRun) {
    console.log(`  [DRY-RUN] ${bloggers.length}개 저장 건너뜀`);
    return bloggers.length;
  }

  // upsert (중복 시 update 안 함, 새것만 삽입)
  const { error } = await supabase
    .from('bloggers')
    .upsert(
      bloggers.map(b => ({
        blog_id: b.blogId,
        blog_name: b.blogName || null,
        category: b.category || null,
        total_posts: b.totalPosts || 0,
        discovered_via: b.discoveredVia,
        discovered_keyword: b.discoveredKeyword || null,
      })),
      { onConflict: 'blog_id', ignoreDuplicates: true }
    );

  if (error) {
    console.error('  [DB] 저장 에러:', error.message);
    return 0;
  }
  return bloggers.length;
}

// ─── 메인 실행: 검색 모드 ───

async function runSearchMode(args) {
  const progress = args.resume ? loadProgress() : { completedKeywords: [], discoveredCount: 0, mode: 'search' };
  const keywords = args.limit ? SEARCH_KEYWORDS.slice(0, args.limit) : SEARCH_KEYWORDS;
  const pendingKeywords = keywords.filter(k => !progress.completedKeywords.includes(k));

  console.log(`\n[검색 모드] 키워드 ${keywords.length}개 중 ${pendingKeywords.length}개 남음`);
  console.log(`  이미 완료: ${progress.completedKeywords.length}개`);
  console.log(`  발견된 블로거: ${progress.discoveredCount}개\n`);

  let totalNew = 0;
  let batch = [];

  for (let i = 0; i < pendingKeywords.length; i++) {
    const keyword = pendingKeywords[i];
    process.stdout.write(`[${i + 1}/${pendingKeywords.length}] "${keyword}" 검색 중... `);

    const blogIds = await searchBlogsByKeyword(keyword);
    console.log(`${blogIds.length}개 발견`);

    for (const blogId of blogIds) {
      batch.push({
        blogId,
        discoveredVia: 'search',
        discoveredKeyword: keyword,
      });
    }

    // 배치 저장
    if (batch.length >= CONFIG.DB_BATCH_SIZE) {
      const saved = await saveBloggersBatch(batch, args.dryRun);
      totalNew += saved;
      batch = [];
    }

    // 진행상황 저장
    progress.completedKeywords.push(keyword);
    progress.discoveredCount += blogIds.length;
    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      saveProgress(progress);
    }

    await sleep(CONFIG.DELAY_MS);
  }

  // 남은 배치 저장
  if (batch.length > 0) {
    const saved = await saveBloggersBatch(batch, args.dryRun);
    totalNew += saved;
  }

  saveProgress(progress);
  console.log(`\n[검색 모드 완료] 총 ${totalNew}개 블로거 저장됨`);
}

// ─── 메인 실행: 카테고리 모드 ───

async function runCategoryMode(args) {
  // 카테고리 키워드로 네이버 검색해서 블로그ID 추출
  const categoryKeywords = [
    // 주요 카테고리 + 지역 조합
    ...SEARCH_KEYWORDS.slice(0, 50), // 인기 키워드 상위 50개
    // 추가 카테고리
    '맛집리뷰', '여행후기', '제품리뷰', '도서리뷰', '영화리뷰',
    '신혼', '워킹맘', '전업주부', '프리랜서', '사이드프로젝트',
    '취미생활', '악기', '수영배우기', '등산후기', '자전거',
  ];

  const limit = args.limit || categoryKeywords.length;
  const keywords = categoryKeywords.slice(0, limit);

  console.log(`\n[카테고리 모드] ${keywords.length}개 키워드로 크롤링`);

  let totalNew = 0;
  let batch = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    process.stdout.write(`[${i + 1}/${keywords.length}] "${keyword}" 크롤링 중... `);

    // 10페이지까지 크롤링
    const allBlogIds = new Set();
    for (let page = 1; page <= 10; page++) {
      const blogIds = await crawlBlogCategory(keyword, page);
      blogIds.forEach(id => allBlogIds.add(id));
      if (blogIds.length < 5) break; // 결과가 적으면 중단
      await sleep(CONFIG.DELAY_MS);
    }

    console.log(`${allBlogIds.size}개 발견`);

    for (const blogId of allBlogIds) {
      batch.push({
        blogId,
        discoveredVia: 'category',
        discoveredKeyword: keyword,
      });
    }

    if (batch.length >= CONFIG.DB_BATCH_SIZE) {
      const saved = await saveBloggersBatch(batch, args.dryRun);
      totalNew += saved;
      batch = [];
    }

    await sleep(CONFIG.DELAY_MS);
  }

  if (batch.length > 0) {
    const saved = await saveBloggersBatch(batch, args.dryRun);
    totalNew += saved;
  }

  console.log(`\n[카테고리 모드 완료] 총 ${totalNew}개 블로거 저장됨`);
}

// ─── 메인 실행: 프로필 보강 모드 ───

async function runProfileMode(args) {
  console.log('\n[프로필 보강 모드] blog_name이 없는 블로거의 프로필 수집');

  // blog_name이 null인 블로거 조회
  const pageSize = 1000;
  let offset = 0;
  let totalUpdated = 0;

  while (true) {
    const { data: bloggers, error } = await supabase
      .from('bloggers')
      .select('blog_id')
      .is('blog_name', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[DB] 조회 에러:', error.message);
      break;
    }
    if (!bloggers || bloggers.length === 0) break;

    console.log(`  ${offset + 1}~${offset + bloggers.length} 처리 중...`);

    const limit = args.limit ? Math.min(bloggers.length, args.limit - totalUpdated) : bloggers.length;

    for (let i = 0; i < limit; i++) {
      const blogger = bloggers[i];
      const profile = await fetchBlogProfile(blogger.blog_id);

      if (profile && !args.dryRun) {
        const { error: updateErr } = await supabase
          .from('bloggers')
          .update({
            blog_name: profile.blogName,
            total_posts: profile.totalPosts,
            category: profile.category,
            crawled_at: new Date().toISOString(),
          })
          .eq('blog_id', blogger.blog_id);

        if (!updateErr) totalUpdated++;
      }

      if ((i + 1) % 50 === 0) {
        process.stdout.write(`  진행: ${totalUpdated}/${offset + i + 1}\r`);
      }

      await sleep(CONFIG.DELAY_MS * 2); // 프로필은 더 천천히
    }

    offset += pageSize;
    if (args.limit && totalUpdated >= args.limit) break;
  }

  console.log(`\n[프로필 보강 완료] ${totalUpdated}개 프로필 업데이트`);
}

// ─── CLI 파싱 ───

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { mode: 'all', limit: 0, resume: false, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      parsed.mode = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      parsed.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--resume') {
      parsed.resume = true;
    } else if (args[i] === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  return parsed;
}

// ─── 통계 출력 ───

async function printStats() {
  const { count: total } = await supabase
    .from('bloggers')
    .select('*', { count: 'exact', head: true });

  const { count: withName } = await supabase
    .from('bloggers')
    .select('*', { count: 'exact', head: true })
    .not('blog_name', 'is', null);

  console.log('\n─── 현재 통계 ───');
  console.log(`총 블로거: ${(total || 0).toLocaleString()}명`);
  console.log(`이름 있음: ${(withName || 0).toLocaleString()}명`);
  console.log(`이름 없음: ${((total || 0) - (withName || 0)).toLocaleString()}명`);
  console.log('─────────────────\n');
}

// ─── 메인 ───

async function main() {
  const args = parseArgs();

  console.log('=== 네이버 블로그 크롤링 ===');
  console.log(`모드: ${args.mode}`);
  if (args.limit) console.log(`제한: ${args.limit}`);
  if (args.resume) console.log('재개 모드');
  if (args.dryRun) console.log('DRY-RUN 모드');

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.error('NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 환경변수가 필요합니다.');
    process.exit(1);
  }

  await printStats();

  switch (args.mode) {
    case 'search':
      await runSearchMode(args);
      break;
    case 'category':
      await runCategoryMode(args);
      break;
    case 'profile':
      await runProfileMode(args);
      break;
    case 'all':
    default:
      await runSearchMode(args);
      await runCategoryMode(args);
      break;
  }

  await printStats();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
