#!/usr/bin/env node
/**
 * 전체 인플루언서 블로그 점수 벌크 계산
 *
 * 모든 인플루언서의 naver_id를 blog_id로 사용하여
 * PostTitleListAsync(Worker 프록시)에서 포스팅 데이터를 가져오고
 * 간이 점수를 계산하여 blog_scores에 저장합니다.
 *
 * 사용법:
 *   node scripts/bulk-score-blogs.mjs                 # 전체 실행
 *   node scripts/bulk-score-blogs.mjs --limit 100     # 최대 100명
 *   node scripts/bulk-score-blogs.mjs --resume        # 중단 지점부터 재개
 *   node scripts/bulk-score-blogs.mjs --dry-run       # DB 저장 없이 테스트
 *   node scripts/bulk-score-blogs.mjs --category 맛집 # 특정 카테고리만
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 설정 ───

const CONFIG = {
  WORKER_URL: 'https://ninfl-proxy.orange-e65.workers.dev',
  DELAY_MS: 800,
  DELAY_ON_ERROR: 3000,
  MAX_RETRIES: 2,
  SAVE_INTERVAL: 50,
  PROGRESS_FILE: resolve(__dirname, '.bulk-score-progress.json'),
};

// ─── 카테고리 매핑 (인플루언서 카테고리 → 블로그 카테고리) ───

const CATEGORY_MAP = {
  '맛집탐방': '맛집', '맛집': '맛집', '푸드': '맛집', '카페': '맛집', '요리': '맛집',
  '여행': '여행', '해외여행': '여행', '국내여행': '여행', '캠핑': '여행',
  '뷰티': '뷰티', '화장품': '뷰티', '스킨케어': '뷰티', '메이크업': '뷰티',
  '패션': '패션', '코디': '패션', '스타일': '패션',
  'IT': 'IT/테크', 'IT/테크': 'IT/테크', '테크': 'IT/테크', '디지털': 'IT/테크',
  '육아': '육아', '임신출산': '육아', '아이': '육아',
  '인테리어': '인테리어', '홈데코': '인테리어', '리빙': '인테리어',
  '건강': '건강', '운동': '건강', '다이어트': '건강', '헬스': '건강', '피트니스': '건강',
  '반려동물': '반려동물', '강아지': '반려동물', '고양이': '반려동물', '펫': '반려동물',
  '자동차': '자동차', '바이크': '자동차',
  '부동산': '부동산', '아파트': '부동산',
  '경제': '경제/재테크', '재테크': '경제/재테크', '주식': '경제/재테크', '투자': '경제/재테크',
  '교육': '교육', '학습': '교육', '영어': '교육',
  '문화': '문화/예술', '예술': '문화/예술', '영화': '문화/예술', '음악': '문화/예술', '책': '문화/예술', '독서': '문화/예술',
  '스포츠': '스포츠', '골프': '스포츠', '축구': '스포츠',
  '일상': '일상/라이프', '라이프': '일상/라이프', '생활': '일상/라이프',
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

function mapCategory(influencerCategory) {
  if (!influencerCategory) return '기타';
  // 정확 매칭
  if (CATEGORY_MAP[influencerCategory]) return CATEGORY_MAP[influencerCategory];
  // 부분 매칭
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (influencerCategory.includes(key) || key.includes(influencerCategory)) return val;
  }
  return '기타';
}

function calcScore(totalPosts, recentMonthPosts, avgComments, subscriberCount) {
  // 포스트 총량 점수 (max 100)
  const volumeScore = Math.min(100, Math.round(
    totalPosts >= 1000 ? 100 :
    totalPosts >= 500 ? 85 :
    totalPosts >= 200 ? 70 :
    totalPosts >= 100 ? 55 :
    totalPosts >= 50 ? 40 :
    totalPosts >= 20 ? 25 :
    totalPosts >= 10 ? 15 : 5
  ));

  // 최근 발행 빈도 점수 (max 100)
  const frequencyScore = Math.min(100, Math.round(
    recentMonthPosts >= 30 ? 100 :
    recentMonthPosts >= 20 ? 85 :
    recentMonthPosts >= 10 ? 70 :
    recentMonthPosts >= 5 ? 50 :
    recentMonthPosts >= 2 ? 30 :
    recentMonthPosts >= 1 ? 15 : 0
  ));

  // 댓글 참여 점수 (max 100)
  const engagementScore = Math.min(100, Math.round(
    avgComments >= 10 ? 100 :
    avgComments >= 5 ? 75 :
    avgComments >= 2 ? 50 :
    avgComments >= 1 ? 30 :
    avgComments >= 0.5 ? 15 : 5
  ));

  // 구독자 점수 (max 100)
  const subscriberScore = Math.min(100, Math.round(
    subscriberCount >= 10000 ? 100 :
    subscriberCount >= 5000 ? 85 :
    subscriberCount >= 1000 ? 70 :
    subscriberCount >= 500 ? 55 :
    subscriberCount >= 100 ? 35 :
    subscriberCount >= 10 ? 15 : 5
  ));

  // 종합 점수 (가중 평균)
  const total = Math.round(
    volumeScore * 0.2 +
    frequencyScore * 0.35 +
    engagementScore * 0.25 +
    subscriberScore * 0.2
  );

  // 등급
  const grade = total >= 90 ? 'S' : total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';

  return { total, volumeScore, frequencyScore, engagementScore, subscriberScore, grade };
}

// ─── Worker 프록시로 블로그 포스트 가져오기 ───

async function fetchBlogPosts(blogId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(
      `${CONFIG.WORKER_URL}/blog-posts?blogId=${encodeURIComponent(blogId)}&page=1&count=30`,
      {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();

    if (data.resultCode !== 'S' && !data.postList) return null;

    const totalCount = data.totalCount || 0;
    const posts = data.postList || [];

    // 최근 30일 포스팅 수 계산
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    let recentCount = 0;
    let totalComments = 0;

    for (const p of posts) {
      totalComments += parseInt(p.commentCnt || '0');
      // addDate: "2026-04-10 10:30:00" 형식
      if (p.addDate) {
        const postDate = new Date(p.addDate.replace(/\./g, '-')).getTime();
        if (postDate >= thirtyDaysAgo) recentCount++;
      }
    }

    const avgComments = posts.length > 0 ? totalComments / posts.length : 0;

    return { totalCount, recentCount, avgComments, postCount: posts.length };
  } catch {
    return null;
  }
}

// ─── 메인 ───

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 0;
  const resume = args.includes('--resume');
  const dryRun = args.includes('--dry-run');
  const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;

  console.log('=== 블로그 벌크 스코어링 시작 ===');
  if (dryRun) console.log('  [DRY RUN] DB 저장 없이 테스트');
  if (limit) console.log(`  최대 ${limit}명 처리`);
  if (categoryFilter) console.log(`  카테고리 필터: ${categoryFilter}`);

  // 진행 상황 로드
  let progress = { processed: 0, lastNaverId: null, stats: { success: 0, failed: 0, skipped: 0 } };
  if (resume && existsSync(CONFIG.PROGRESS_FILE)) {
    progress = JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8'));
    console.log(`  재개: ${progress.processed}명 처리 완료 지점부터`);
  }

  // 이미 blog_scores에 있는 blog_id 목록
  const { data: existingScores } = await supabase
    .from('blog_scores')
    .select('blog_id');
  const existingBlogIds = new Set((existingScores || []).map(s => s.blog_id));
  console.log(`  기존 blog_scores: ${existingBlogIds.size}개`);

  // 인플루언서 목록 가져오기 (Supabase 1000행 제한 → 페이지네이션)
  let targets = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase
      .from('influencers')
      .select('naver_id, display_name, category, subscriber_count, fan_count')
      .order('naver_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (categoryFilter) {
      query = query.ilike('category', `%${categoryFilter}%`);
    }

    const { data, error } = await query;
    if (error) { console.error('인플루언서 조회 실패:', error.message); break; }
    if (!data || data.length === 0) break;
    targets.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`  전체 인플루언서: ${targets.length}명`);

  // 이미 처리된 항목 건너뛰기
  if (resume && progress.lastNaverId) {
    const idx = targets.findIndex(t => t.naver_id === progress.lastNaverId);
    if (idx >= 0) targets = targets.slice(idx + 1);
  }

  // 이미 blog_scores에 있는 항목 건너뛰기
  targets = targets.filter(t => !existingBlogIds.has(t.naver_id));
  console.log(`  신규 처리 대상: ${targets.length}명`);

  if (limit > 0) targets = targets.slice(0, limit);

  let { success, failed, skipped } = progress.stats;
  const startTime = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const inf = targets[i];
    const blogId = inf.naver_id; // naver_id를 blog_id로 사용

    try {
      const blogData = await fetchBlogPosts(blogId);

      if (!blogData || blogData.totalCount === 0) {
        skipped++;
        if ((i + 1) % 100 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
          console.log(`  [${i + 1}/${targets.length}] ${elapsed}분 | 성공:${success} 실패:${failed} 스킵:${skipped}`);
        }
        await sleep(CONFIG.DELAY_MS / 2); // 빈 블로그는 빠르게 넘김
        continue;
      }

      const subscriberCount = inf.subscriber_count || inf.fan_count || 0;
      const score = calcScore(
        blogData.totalCount,
        blogData.recentCount,
        blogData.avgComments,
        subscriberCount,
      );

      const category = mapCategory(inf.category);

      if (!dryRun) {
        const { error: upsertError } = await supabase
          .from('blog_scores')
          .upsert({
            blog_id: blogId,
            blog_name: inf.display_name || blogId,
            total_score: score.total,
            crank_score: score.volumeScore,
            dia_score: score.frequencyScore,
            diaplus_score: score.engagementScore,
            grade: score.grade,
            category,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'blog_id' });

        if (upsertError) {
          console.error(`  [오류] ${blogId}: ${upsertError.message}`);
          failed++;
        } else {
          success++;
        }
      } else {
        console.log(`  [DRY] ${blogId}: ${score.total}점(${score.grade}) | 글 ${blogData.totalCount}개 | 월 ${blogData.recentCount}개 | 카테고리: ${category}`);
        success++;
      }
    } catch (err) {
      console.error(`  [오류] ${blogId}: ${err.message}`);
      failed++;
      await sleep(CONFIG.DELAY_ON_ERROR);
    }

    // 진행 상황 저장
    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      progress = {
        processed: i + 1,
        lastNaverId: blogId,
        stats: { success, failed, skipped },
      };
      writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = ((i + 1) / (Date.now() - startTime) * 1000 * 60).toFixed(0);
      const eta = (((targets.length - i - 1) / rate)).toFixed(1);
      console.log(`  [${i + 1}/${targets.length}] ${elapsed}분 경과 | ${rate}건/분 | ETA ${eta}분 | 성공:${success} 실패:${failed} 스킵:${skipped}`);
    }

    await sleep(CONFIG.DELAY_MS);
  }

  // 최종 진행 상황 저장
  writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));

  const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('\n=== 완료 ===');
  console.log(`  총 소요: ${totalElapsed}분`);
  console.log(`  성공: ${success}명`);
  console.log(`  실패: ${failed}명`);
  console.log(`  스킵(블로그 없음): ${skipped}명`);

  // blog_scores 총 개수 확인
  const { count } = await supabase
    .from('blog_scores')
    .select('*', { count: 'exact', head: true });
  console.log(`  blog_scores 총: ${count}개`);
}

main().catch(err => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
