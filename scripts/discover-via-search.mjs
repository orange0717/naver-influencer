#!/usr/bin/env node
/**
 * 네이버 통합검색 인플루언서 탭을 통한 신규 인플루언서 발굴
 *
 * 배경:
 *   - 기존 discover-new-influencers 는 keyword_challenges 참가자만 발굴
 *   - 챌린지 미참여 신규 인플루언서(예: hi_it)는 누락됨
 *   - 본 스크립트는 search.naver.com?where=influencer 결과에서 핸들을 추출하여
 *     우리 DB 미등록 인플을 발굴, in.naver.com 프로필 직접 파싱하여 등록
 *
 * 키워드 소스: keyword_challenges (participant_count desc)
 *
 * 사용법:
 *   node scripts/discover-via-search.mjs                       # dry-run, 상위 100 키워드
 *   node scripts/discover-via-search.mjs --apply --top 500     # 실제 저장
 *   node scripts/discover-via-search.mjs --apply --keyword IT  # 특정 키워드만
 *   node scripts/discover-via-search.mjs --apply --resume      # 중단 지점부터
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  SEARCH_URL: 'https://search.naver.com/search.naver',
  PROFILE_URL: 'https://in.naver.com',
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  DELAY_SEARCH_MS: 800,
  DELAY_PROFILE_MS: 600,
  DELAY_ON_ERROR_MS: 3000,
  MAX_RETRIES: 2,
  REQUEST_TIMEOUT_MS: 15000,
  PROGRESS_FILE: resolve(__dirname, '.discover-via-search-progress.json'),
};

// 시스템 경로/일반 reserved 핸들 — 인플루언서가 아님
const RESERVED = new Set([
  'home', 'categories', 'search', 'help', 'about', 'login', 'logout', 'signup',
  'delivery', 'identity-access', 'discover', 'myfeed', 'recent', 'setting', 'recommend',
  'notice', 'event', 'contact', 'terms', 'privacy', 'apply', 'open',
  'static', 'images', 'js', 'css', 'api', 'graphql', 'mobile', 'app',
]);

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) { console.error('.env.local 없음'); process.exit(1); }
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://search.naver.com/',
        },
      });
      clearTimeout(to);
      if (res.status === 429) {
        await sleep(4000 * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(to);
      if (attempt < retries) { await sleep(CONFIG.DELAY_ON_ERROR_MS); continue; }
      throw err;
    }
  }
  return null;
}

function extractHandles(html) {
  const matches = Array.from(html.matchAll(/in\.naver\.com\/([a-zA-Z0-9_.-]+)/g)).map(m => m[1]);
  const unique = [...new Set(matches)]
    .filter(x => !RESERVED.has(x))
    .filter(x => x.length >= 2 && x.length <= 60)
    // 끝에 . 있으면 제거 (정규식 매칭 잔여)
    .map(x => x.replace(/\.+$/, ''))
    .filter(x => x.length >= 2);
  return unique;
}

async function searchInfluencers(query) {
  const url = `${CONFIG.SEARCH_URL}?where=influencer&query=${encodeURIComponent(query)}`;
  const res = await fetchWithRetry(url);
  if (!res?.ok) return [];
  const html = await res.text();
  return extractHandles(html);
}

async function fetchProfile(naverId) {
  const url = `${CONFIG.PROFILE_URL}/${naverId}`;
  const res = await fetchWithRetry(url);
  if (!res?.ok) return null;
  const html = await res.text();
  const idx = html.indexOf('__PRELOADED_STATE__');
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  let depth = 0, end = -1;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') depth--;
    if (depth === 0) { end = i + 1; break; }
  }
  if (end === -1) return null;
  let state;
  try { state = JSON.parse(html.substring(start, end)); }
  catch { return null; }
  const space = state?.space?.data;
  if (!space?.ownerId) return null; // 인플루언서가 아닌 페이지
  const profile = space.profile || {};
  const stats = space.stats || {};
  const myKw = space.myKeyword || {};
  return {
    naver_id: naverId,
    display_name: profile.nickName || '',
    profile_url: `${CONFIG.PROFILE_URL}/${naverId}`,
    image_url: profile.profileImageUrl || '',
    introduction: profile.introduction || '',
    subscriber_count: stats.subscriberCount || 0,
    total_follower_count: space.totalFollowerCount || profile.followerCount || 0,
    my_keyword: myKw.keyword || '',
    my_keyword_category: myKw.category || '',
    category: myKw.category || '',
    naver_owner_id: space.ownerId,
    naver_created_at: space.createdAt || null,
    first_seen_at: new Date().toISOString(),
    last_crawled_at: new Date().toISOString(),
  };
}

function loadProgress() {
  if (existsSync(CONFIG.PROGRESS_FILE)) return JSON.parse(readFileSync(CONFIG.PROGRESS_FILE, 'utf-8'));
  return { processedKeywords: [] };
}
function saveProgress(p) { writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(p, null, 2)); }

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const hasArg = (n) => args.includes(n);

const isApply = hasArg('--apply');
const topKeywords = getArg('--top') ? parseInt(getArg('--top')) : 100;
const onlyKeyword = getArg('--keyword');
const isResume = hasArg('--resume');

async function main() {
  console.log('=== 통합검색 인플루언서 발굴 ===');
  console.log(`모드: ${isApply ? 'APPLY (DB 저장)' : 'DRY-RUN'}, top=${topKeywords}${onlyKeyword ? `, keyword=${onlyKeyword}` : ''}`);
  if (!isApply) console.log('*** dry-run — --apply 추가해야 저장 ***');

  // 기존 인플 핸들 로드 (페이지네이션)
  const existing = new Set();
  let off = 0;
  while (true) {
    const { data } = await supabase.from('influencers').select('naver_id').range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) existing.add(r.naver_id);
    off += data.length;
    if (data.length < 1000) break;
  }
  console.log(`기존 DB: ${existing.size}명`);

  // 키워드 풀 (Supabase 1000 row 제한 우회 — range 페이지네이션)
  // participant_count 상위만 계속 훑으면 이미 포화된 인기 키워드만 반복 조회하게 되어
  // 전체 풀 대부분이 발굴 사각지대로 남음 → 20% 인기 + 80% 장기 미조회 로테이션으로 혼합.
  let keywordRows = [];
  if (onlyKeyword) {
    keywordRows = [{ id: null, keyword: onlyKeyword }];
  } else {
    const tier1Size = Math.max(1, Math.floor(topKeywords * 0.2));
    const tier2Size = topKeywords - tier1Size;

    const tier1 = [];
    let off = 0;
    while (tier1.length < tier1Size) {
      const fetchSize = Math.min(tier1Size - tier1.length, 1000);
      const { data } = await supabase
        .from('keyword_challenges')
        .select('id, keyword, participant_count')
        .order('participant_count', { ascending: false })
        .range(off, off + fetchSize - 1);
      if (!data || data.length === 0) break;
      tier1.push(...data);
      off += data.length;
      if (data.length < fetchSize) break;
    }

    const tier2 = [];
    off = 0;
    while (tier2.length < tier2Size) {
      const fetchSize = Math.min(tier2Size - tier2.length, 1000);
      const { data } = await supabase
        .from('keyword_challenges')
        .select('id, keyword, participant_count')
        .order('influencer_crawled_at', { ascending: true, nullsFirst: true })
        .range(off, off + fetchSize - 1);
      if (!data || data.length === 0) break;
      tier2.push(...data);
      off += data.length;
      if (data.length < fetchSize) break;
    }

    const seen = new Set();
    for (const row of [...tier1, ...tier2]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      keywordRows.push(row);
    }
  }
  const keywords = keywordRows.map(r => r.keyword);
  const keywordIdByName = new Map(keywordRows.filter(r => r.id).map(r => [r.keyword, r.id]));
  console.log(`대상 키워드: ${keywords.length}개 (인기 상위 + 장기 미조회 로테이션 혼합)\n`);

  const progress = loadProgress();
  const processed = new Set(isResume ? (progress.processedKeywords || []) : []);
  if (!isResume) saveProgress({ processedKeywords: [] });

  let cancelled = false;
  process.on('SIGINT', () => { console.log('\n중단 요청. 진행 저장.'); cancelled = true; });

  const candidates = new Set(); // 우리 DB에 없는 핸들
  let emptyCount = 0, attempted = 0;
  for (let i = 0; i < keywords.length; i++) {
    if (cancelled) break;
    const kw = keywords[i];
    if (processed.has(kw)) continue;
    try {
      const handles = await searchInfluencers(kw);
      attempted++;
      if (handles.length === 0) emptyCount++;
      let newOnes = 0;
      for (const h of handles) {
        if (!existing.has(h) && !candidates.has(h)) {
          candidates.add(h);
          newOnes++;
        }
      }
      processed.add(kw);
      const kwId = keywordIdByName.get(kw);
      if (isApply && kwId) {
        await supabase.from('keyword_challenges')
          .update({ influencer_crawled_at: new Date().toISOString() })
          .eq('id', kwId);
      }
      process.stdout.write(`\r  [${i + 1}/${keywords.length}] "${kw}" 결과 ${handles.length} / 신규후보 ${newOnes} (누적 ${candidates.size})       `);
    } catch (e) {
      process.stdout.write(`\r  [${i + 1}/${keywords.length}] "${kw}" ERR ${e.message?.slice(0, 40)}\n`);
    }
    if ((i + 1) % 20 === 0) saveProgress({ processedKeywords: Array.from(processed) });
    await sleep(CONFIG.DELAY_SEARCH_MS);
  }
  saveProgress({ processedKeywords: Array.from(processed) });

  console.log(`\n\n신규 후보 핸들: ${candidates.size}개`);
  console.log('프로필 검증 + 등록 시작...\n');

  let inserted = 0, skipped = 0, failed = 0;
  const list = Array.from(candidates);
  for (let i = 0; i < list.length; i++) {
    if (cancelled) break;
    const h = list[i];
    try {
      const row = await fetchProfile(h);
      if (!row) { skipped++; }
      else if (isApply) {
        const { error } = await supabase.from('influencers').upsert(row, { onConflict: 'naver_id' });
        if (error) { failed++; console.log(`\n  upsert 실패 ${h}: ${error.message}`); }
        else { inserted++; }
      } else {
        inserted++;
      }
      process.stdout.write(`\r  [${i + 1}/${list.length}] ${h} (insert ${inserted} / skip ${skipped} / fail ${failed})        `);
    } catch (e) {
      failed++;
      process.stdout.write(`\r  [${i + 1}/${list.length}] ${h} ERR\n`);
    }
    await sleep(CONFIG.DELAY_PROFILE_MS);
  }

  console.log('\n\n=== 완료 ===');
  console.log(`  키워드: ${keywords.length}, 후보: ${candidates.size}`);
  console.log(`  ${isApply ? '등록' : 'dry-run'}: ${inserted}, skip(인플 아님): ${skipped}, fail: ${failed}`);

  // 2026-08-22 실측: 네이버가 러너 IP를 막자 3,462개 중 3,461개가 결과 0으로 돌아왔는데도
  // 워크플로는 success로 끝났다. 정상일 0건 비율은 53~71%라 90% 초과는 차단으로 본다.
  const emptyRatio = attempted > 0 ? emptyCount / attempted : 0;
  console.log(`  0건 키워드: ${emptyCount}/${attempted} (${(emptyRatio * 100).toFixed(1)}%)`);
  if (attempted >= 50 && emptyRatio >= 0.9) {
    console.error(`::error ::검색 결과 0건 비율 ${(emptyRatio * 100).toFixed(1)}% — 네이버 차단 의심`);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
