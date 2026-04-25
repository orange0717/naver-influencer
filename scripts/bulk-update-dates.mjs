/**
 * 전체 인플루언서 마지막 참여일(last_challenged_at) 갱신 스크립트
 *
 * 실행: node scripts/bulk-update-dates.mjs
 *
 * 네이버 API에서 실제 마지막 참여일을 가져와 DB 업데이트
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://gppfpmuadpnxmeefomwz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcGZwbXVhZHBueG1lZWZvbXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3OTY1MiwiZXhwIjoyMDg4NTU1NjUyfQ.-DcOEoFdTSp20XbViMPIHyOleDgYg8h5tvmcUGFBUzk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PROGRESS_FILE = 'scripts/.bulk-dates-progress.json';
const BATCH_SIZE = 100; // DB에서 한번에 가져올 인플루언서 수
const SLEEP_MS = 500; // API 호출 간 대기 (네이버 차단 방지)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
      if (res.ok) return res;
      if (res.status === 429) {
        console.log('  Rate limited, waiting 5s...');
        await sleep(5000);
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries - 1) {
        await sleep(2000);
        continue;
      }
      throw err;
    }
  }
}

async function fetchOwnerId(naverId) {
  try {
    const res = await fetchWithRetry(`https://in.naver.com/${naverId}`, {
      headers: { Referer: 'https://in.naver.com/' },
    });
    const html = await res.text();
    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return null;

    const jsonStart = html.indexOf('{', idx);
    let depth = 0, jsonEnd = -1;
    for (let i = jsonStart; i < Math.min(jsonStart + 100000, html.length); i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
    if (jsonEnd === -1) return null;

    const state = JSON.parse(html.substring(jsonStart, jsonEnd));
    return state?.space?.data?.ownerId ? String(state.space.data.ownerId) : null;
  } catch { return null; }
}

async function fetchLastChallengedAt(ownerId) {
  try {
    const res = await fetchWithRetry(`${PARTICIPATED_API}?ownerId=${ownerId}&limit=1`, {
      headers: { Referer: 'https://in.naver.com/' },
    });
    const json = await res.json();
    const items = json?.data || [];
    if (items.length === 0) return null;

    // 첫 페이지만 가져와서 lastChallengedAt 추출
    const dates = items
      .map(k => k.lastChallengedAt)
      .filter(Boolean)
      .map(d => new Date(d + '+09:00').getTime())
      .filter(t => !isNaN(t));

    // 전체 키워드의 마지막 참여일을 정확히 얻으려면 모든 페이지를 봐야 하지만,
    // 빠른 업데이트를 위해 total_keywords와 함께 최신 1페이지만 확인
    const total = json?.paging?.total || items.length;

    return {
      lastChallengedAt: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
      totalKeywords: total,
    };
  } catch { return null; }
}

// 진행 상태 저장/로드
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { lastId: null, processed: 0, updated: 0, failed: 0 };
  }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

async function main() {
  const progress = loadProgress();
  console.log(`\n=== 마지막 참여일 갱신 스크립트 ===`);
  console.log(`진행: ${progress.processed}명 처리 / ${progress.updated}명 갱신 / ${progress.failed}명 실패\n`);

  let hasMore = true;
  let lastId = progress.lastId;

  while (hasMore) {
    // 인플루언서 배치 조회 (id 오름차순)
    let query = supabase
      .from('influencers')
      .select('id, naver_id, naver_owner_id')
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (lastId) {
      query = query.gt('id', lastId);
    }

    const { data: influencers, error } = await query;
    if (error) {
      console.error('DB 조회 실패:', error.message);
      break;
    }

    if (!influencers || influencers.length === 0) {
      hasMore = false;
      console.log('\n모든 인플루언서 처리 완료!');
      break;
    }

    for (const inf of influencers) {
      try {
        // ownerId 확보
        let ownerId = inf.naver_owner_id;
        if (!ownerId) {
          ownerId = await fetchOwnerId(inf.naver_id);
          if (!ownerId) {
            progress.failed++;
            console.log(`  [SKIP] ${inf.naver_id} - ownerId 없음`);
            continue;
          }
          // ownerId 저장
          await supabase.from('influencers').update({ naver_owner_id: ownerId }).eq('id', inf.id);
          await sleep(300);
        }

        // 마지막 참여일 조회
        const result = await fetchLastChallengedAt(ownerId);
        if (!result) {
          progress.failed++;
          console.log(`  [SKIP] ${inf.naver_id} - API 실패`);
          await sleep(SLEEP_MS);
          continue;
        }

        // DB 업데이트
        const updateData = {};
        if (result.lastChallengedAt) {
          updateData.last_challenged_at = result.lastChallengedAt;
          updateData.last_crawled_at = result.lastChallengedAt;
        }

        if (Object.keys(updateData).length > 0) {
          await supabase.from('influencers').update(updateData).eq('id', inf.id);
          progress.updated++;
        }

        progress.processed++;
        lastId = inf.id;
        progress.lastId = lastId;

        if (progress.processed % 10 === 0) {
          saveProgress(progress);
          console.log(`[${progress.processed}] ${inf.naver_id} → ${result.lastChallengedAt ? new Date(result.lastChallengedAt).toLocaleDateString('ko-KR') : '참여 없음'}`);
        }

        await sleep(SLEEP_MS);
      } catch (err) {
        progress.failed++;
        console.error(`  [ERROR] ${inf.naver_id}:`, err.message);
        await sleep(1000);
      }
    }

    saveProgress(progress);
    console.log(`--- 배치 완료: ${progress.processed}명 처리 / ${progress.updated}명 갱신 ---`);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`총 ${progress.processed}명 처리 / ${progress.updated}명 갱신 / ${progress.failed}명 실패`);
}

main().catch(console.error);
