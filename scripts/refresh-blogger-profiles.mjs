#!/usr/bin/env node
/**
 * 블로거 프로필 갱신 스크립트
 *
 * 네이버 블로그 `PostTitleListAsync.naver` 엔드포인트에서
 *  - totalCount → total_posts
 *  - 첫 번째 post 의 addDate → last_post_date
 * 를 추출해 bloggers 테이블에 반영.
 *
 * 구독자수(subscriber_count)는 이 엔드포인트로 획득 불가 — 별도 작업.
 *
 * 대상 선택:
 *  - is_active=true 블로거
 *  - global_rank 상위부터 (중요한 블로거 먼저)
 *  - crawled_at 이 N일 이상 오래된 것만 (기본 1일)
 *
 * 기본 동작: dry-run. --apply 를 주어야 DB 저장.
 *
 * 사용법:
 *   node scripts/refresh-blogger-profiles.mjs                         # dry-run
 *   node scripts/refresh-blogger-profiles.mjs --apply --limit 1000    # 상위 1000명
 *   node scripts/refresh-blogger-profiles.mjs --apply --blog-id X     # 특정 1명
 *   node scripts/refresh-blogger-profiles.mjs --apply --stale-days 3  # 3일 이상 stale 만
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  POST_LIST_API: 'https://blog.naver.com/PostTitleListAsync.naver',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  DELAY_MS: 800,
  DELAY_ON_ERROR: 3000,
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT_MS: 12000,
  SAVE_INTERVAL: 50,
  PROGRESS_FILE: resolve(__dirname, '.refresh-blogger-profiles-progress.json'),
};

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://blog.naver.com/',
        },
      });
      clearTimeout(to);
      if (res.status === 429) {
        const wait = 4000 * Math.pow(2, attempt);
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

// "6시간 전", "어제", "2026. 4. 20." 형식 → YYYY-MM-DD
function parseAddDate(s) {
  if (!s) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = String(s).trim();
  if (t.includes('시간 전') || t.includes('분 전') || t.includes('초 전')) {
    return today.toISOString().slice(0, 10);
  }
  if (t === '어제') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return y.toISOString().slice(0, 10);
  }
  const m = t.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

async function fetchBlogProfile(blogId) {
  const url = `${CONFIG.POST_LIST_API}?blogId=${encodeURIComponent(blogId)}&currentPage=1&countPerPage=5`;
  const res = await fetchWithRetry(url);
  if (!res || !res.ok) return null;

  let json;
  try {
    // 네이버 응답에 잘못된 이스케이프 가 섞여있어 pagingHtml 은 제외하고 파싱
    const raw = await res.text();
    // "pagingHtml":"..." 블록 제거 (내부에 \' 등이 있어 JSON.parse 실패)
    const sanitized = raw.replace(/"pagingHtml":"[\s\S]*?","parameters"/, '"parameters"');
    json = JSON.parse(sanitized);
  } catch {
    return null;
  }

  if (json?.resultCode !== 'S') return null;

  const totalPosts = parseInt(json?.totalCount);
  const firstPost = json?.postList?.[0];
  const lastPostDate = firstPost ? parseAddDate(firstPost.addDate) : null;

  return {
    total_posts: Number.isFinite(totalPosts) ? totalPosts : null,
    last_post_date: lastPostDate,
  };
}

// ─── CLI ───

const args = process.argv.slice(2);
const hasArg = (n) => args.includes(n);
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const isApply = hasArg('--apply');
const isResume = hasArg('--resume');
const limitCount = getArg('--limit') ? parseInt(getArg('--limit')) : 1000;
const staleDays = getArg('--stale-days') ? parseInt(getArg('--stale-days')) : 1;
const onlyBlogId = getArg('--blog-id');
// 정렬 모드:
//   기본 = 'stale'  → crawled_at ASC NULLS FIRST (로테이션. 오래된 것부터 →  매일 N명 꾸준히 갱신하면 전체 커버)
//   'rank'         → global_rank ASC (상위 랭커 우선)
const orderMode = (getArg('--order') === 'rank') ? 'rank' : 'stale';
const shardNum = getArg('--shard') ? parseInt(getArg('--shard')) : 0;
const shardCount = getArg('--shards') ? parseInt(getArg('--shards')) : 1;

if (shardCount > 1) {
  if (shardNum < 0 || shardNum >= shardCount) {
    console.error(`--shard 값은 0 <= N < ${shardCount} 이어야 합니다.`);
    process.exit(1);
  }
  // shard 별 progress 파일 분리
  CONFIG.PROGRESS_FILE = resolve(__dirname, `.refresh-blogger-profiles-progress-shard${shardNum}of${shardCount}.json`);
}

function loadProgress() {
  if (isResume && existsSync(CONFIG.PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8')); } catch {}
  }
  return { lastIndex: 0 };
}
function saveProgress(p) { writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function main() {
  console.log('=== 블로거 프로필(포스트 수/최근 포스트일) 갱신 ===');
  console.log(`모드: ${isApply ? 'APPLY (DB 저장)' : 'DRY-RUN (저장 안 함)'}, limit=${limitCount}, stale-days=${staleDays}${onlyBlogId ? `, blog-id=${onlyBlogId}` : ''}`);

  let bloggers = [];
  if (onlyBlogId) {
    const { data } = await supabase.from('bloggers')
      .select('id, blog_id, total_posts, last_post_date, crawled_at')
      .eq('blog_id', onlyBlogId).limit(1).maybeSingle();
    if (data) bloggers = [data];
  } else {
    const staleThreshold = new Date(Date.now() - staleDays * 86400000).toISOString();
    const pageSize = 1000;
    let offset = 0;
    while (bloggers.length < limitCount) {
      const remaining = limitCount - bloggers.length;
      const chunk = Math.min(pageSize, remaining);
      let q = supabase.from('bloggers')
        .select('id, blog_id, total_posts, last_post_date, crawled_at, global_rank')
        .eq('is_active', true)
        .not('global_rank', 'is', null)
        .or(`crawled_at.is.null,crawled_at.lt.${staleThreshold}`);
      q = orderMode === 'rank'
        ? q.order('global_rank', { ascending: true })
        : q.order('crawled_at', { ascending: true, nullsFirst: true });
      const { data, error } = await q.range(offset, offset + chunk - 1);
      if (error) { console.error('조회 실패:', error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      bloggers.push(...data);
      offset += data.length;
      if (data.length < chunk) break;
    }
  }

  // shard 적용 (index % shardCount === shardNum 인 것만)
  if (shardCount > 1 && !onlyBlogId) {
    const before = bloggers.length;
    bloggers = bloggers.filter((_, i) => i % shardCount === shardNum);
    console.log(`shard ${shardNum}/${shardCount} 적용: ${before}명 → ${bloggers.length}명`);
  }

  const total = bloggers.length;
  console.log(`대상 블로거: ${total}명`);
  if (total === 0) { console.log('갱신할 대상이 없습니다.'); return; }

  const progress = isResume ? loadProgress() : { lastIndex: 0 };
  const startIdx = isResume ? (progress.lastIndex || 0) : 0;

  let updated = 0, noChange = 0, skipped = 0, failed = 0;
  let cancelled = false;
  process.on('SIGINT', () => { console.log('\n중단 요청. 진행 저장 후 종료'); cancelled = true; });

  for (let i = startIdx; i < total; i++) {
    if (cancelled) break;
    const b = bloggers[i];

    try {
      const fresh = await fetchBlogProfile(b.blog_id);
      if (!fresh) {
        skipped++;
        process.stdout.write(`\r  [${i + 1}/${total}] ${b.blog_id}: 프로필 없음 (u${updated} n${noChange} s${skipped} f${failed})         `);
        await sleep(CONFIG.DELAY_MS);
        continue;
      }

      const updateData = { crawled_at: new Date().toISOString() };
      if (fresh.total_posts !== null && fresh.total_posts !== b.total_posts) {
        updateData.total_posts = fresh.total_posts;
      }
      if (fresh.last_post_date && fresh.last_post_date !== b.last_post_date) {
        updateData.last_post_date = fresh.last_post_date;
      }

      const hasRealChange = Object.keys(updateData).length > 1;
      if (!hasRealChange) {
        noChange++;
        process.stdout.write(`\r  [${i + 1}/${total}] ${b.blog_id}: 변화 없음 (posts=${fresh.total_posts}) (u${updated} n${noChange} s${skipped} f${failed})       `);
      } else {
        if (isApply) {
          const { error } = await supabase.from('bloggers').update(updateData).eq('id', b.id);
          if (error) {
            failed++;
            console.error(`\n  DB 오류 [${b.blog_id}]: ${error.message}`);
            await sleep(CONFIG.DELAY_ON_ERROR);
            continue;
          }
        }
        updated++;
        const changes = [];
        if ('total_posts' in updateData) changes.push(`posts=${updateData.total_posts}`);
        if ('last_post_date' in updateData) changes.push(`last_post=${updateData.last_post_date}`);
        process.stdout.write(`\r  [${i + 1}/${total}] ${b.blog_id}: ${changes.join(', ')} (u${updated} n${noChange} s${skipped} f${failed})         `);
      }
    } catch (err) {
      failed++;
      console.error(`\n  오류 [${b.blog_id}]:`, err.message);
      await sleep(CONFIG.DELAY_ON_ERROR);
    }

    if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
      progress.lastIndex = i + 1;
      saveProgress(progress);
    }
    await sleep(CONFIG.DELAY_MS);
  }

  progress.lastIndex = cancelled ? progress.lastIndex : total;
  saveProgress(progress);

  console.log('\n\n=== 완료 ===');
  console.log(`  업데이트: ${updated}명`);
  console.log(`  변화 없음: ${noChange}명`);
  console.log(`  스킵(프로필 없음): ${skipped}명`);
  console.log(`  실패: ${failed}명`);
  if (!isApply) console.log('\n*** dry-run — 실제 저장하려면 --apply ***');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
