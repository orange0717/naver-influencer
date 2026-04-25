/**
 * 전체 인플루언서 종합 데이터 갱신 스크립트
 * 팬수 + 참여일 + 챌린지수 + TOP3 + 비율 + 평균순위 전부 갱신
 *
 * 실행: node scripts/bulk-update-all.mjs
 * 이어서 실행: 자동으로 progress 파일에서 이어서 진행
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://gppfpmuadpnxmeefomwz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcGZwbXVhZHBueG1lZWZvbXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3OTY1MiwiZXhwIjoyMDg4NTU1NjUyfQ.-DcOEoFdTSp20XbViMPIHyOleDgYg8h5tvmcUGFBUzk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const PROGRESS_FILE = 'scripts/.bulk-all-progress.json';
const BATCH_SIZE = 100;
const SLEEP_MS = 200;
const PARALLEL = 3; // 동시 처리 수

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
      if (res.ok) return res;
      if (res.status === 429) { await sleep(5000); continue; }
      return res;
    } catch (err) {
      if (i < retries - 1) { await sleep(2000); continue; }
      throw err;
    }
  }
}

/** 프로필 페이지에서 ownerId + subscriberCount 추출 */
async function fetchProfile(naverId) {
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
    const ownerId = state?.space?.data?.ownerId ? String(state.space.data.ownerId) : null;
    const totalFollowerCount = state?.space?.data?.totalFollowerCount || 0;
    // subscriberCount는 중첩된 위치에 있으므로 HTML에서 직접 추출
    const scMatch = html.match(/"subscriberCount":(\d+)/);
    const subscriberCount = scMatch ? parseInt(scMatch[1]) : 0;
    return { ownerId, subscriberCount, totalFollowerCount };
  } catch { return null; }
}

/** 전체 참여 키워드 가져오기 (모든 페이지) */
async function fetchAllKeywords(ownerId) {
  const results = [];
  let cursor;

  for (let page = 0; page < 100; page++) {
    let url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url, { headers: { Referer: 'https://in.naver.com/' } });
      const json = await res.json();
      const items = json?.data || [];
      results.push(...items);

      if (results.length >= 2000) break;
      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
      await sleep(300);
    } catch { break; }
  }

  return results;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { lastId: null, processed: 0, updated: 0, failed: 0, fanUpdated: 0 }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

async function main() {
  const progress = loadProgress();
  console.log(`\n=== 종합 데이터 갱신 스크립트 ===`);
  console.log(`진행: ${progress.processed}명 / 갱신: ${progress.updated}명 / 팬수: ${progress.fanUpdated}명 / 실패: ${progress.failed}명\n`);

  let hasMore = true;
  let lastId = progress.lastId;

  while (hasMore) {
    let query = supabase
      .from('influencers')
      .select('id, naver_id, naver_owner_id')
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (lastId) query = query.gt('id', lastId);

    const { data: influencers, error } = await query;
    if (error) { console.error('DB 조회 실패:', error.message); break; }
    if (!influencers || influencers.length === 0) { hasMore = false; console.log('\n모든 인플루언서 처리 완료!'); break; }

    // 병렬 처리 (PARALLEL개씩)
    for (let i = 0; i < influencers.length; i += PARALLEL) {
      const chunk = influencers.slice(i, i + PARALLEL);

      await Promise.all(chunk.map(async (inf) => {
        try {
          const updateData = {};

          const profile = await fetchProfile(inf.naver_id);
          if (!profile) { progress.failed++; progress.processed++; return; }

          if (profile.subscriberCount > 0) {
            updateData.subscriber_count = profile.subscriberCount;
            updateData.total_follower_count = profile.totalFollowerCount;
            progress.fanUpdated++;
          }

          let ownerId = inf.naver_owner_id || profile.ownerId;
          if (!inf.naver_owner_id && profile.ownerId) updateData.naver_owner_id = profile.ownerId;

          if (ownerId) {
            const keywords = await fetchAllKeywords(ownerId);
            if (keywords.length > 0) {
              const dates = keywords.map(k => k.lastChallengedAt).filter(Boolean)
                .map(d => new Date(d + '+09:00').getTime()).filter(t => !isNaN(t));
              if (dates.length > 0) {
                const lastChallengedAt = new Date(Math.max(...dates)).toISOString();
                updateData.last_challenged_at = lastChallengedAt;
                updateData.last_crawled_at = lastChallengedAt;
              }
              const ranked = keywords.filter(k => k.rank != null && k.rank > 0);
              const t1 = ranked.filter(k => k.rank === 1).length;
              const t2 = ranked.filter(k => k.rank === 2).length;
              const t3 = ranked.filter(k => k.rank === 3).length;
              updateData.total_keywords = keywords.length;
              updateData.integrated_top3_count = t1 + t2 + t3;
              updateData.top1_count = t1; updateData.top2_count = t2; updateData.top3_count = t3;
              updateData.top3_ratio = keywords.length > 0 ? +((t1+t2+t3)/keywords.length).toFixed(4) : 0;
              updateData.best_rank = ranked.length > 0 ? Math.min(...ranked.map(k => k.rank)) : null;
              updateData.avg_rank = ranked.length > 0 ? +(ranked.reduce((s,k)=>s+k.rank,0)/ranked.length).toFixed(2) : null;
            }
          }

          if (Object.keys(updateData).length > 0) {
            await supabase.from('influencers').update(updateData).eq('id', inf.id);
            progress.updated++;
          }
          progress.processed++;
        } catch (err) {
          progress.failed++; progress.processed++;
          console.error(`  [ERROR] ${inf.naver_id}:`, err.message);
        }
      }));

      lastId = chunk[chunk.length - 1].id;
      progress.lastId = lastId;

      if (progress.processed % 10 === 0) {
        saveProgress(progress);
        console.log(`[${progress.processed}] ${chunk.map(c=>c.naver_id).join(', ')} | 갱신${progress.updated} 팬${progress.fanUpdated}`);
      }

      await sleep(SLEEP_MS);
    }

    saveProgress(progress);
    console.log(`--- 배치 완료: ${progress.processed}명 / 갱신 ${progress.updated}명 / 팬수 ${progress.fanUpdated}명 ---`);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`총 ${progress.processed}명 / 갱신 ${progress.updated}명 / 팬수 ${progress.fanUpdated}명 / 실패 ${progress.failed}명`);
}

main().catch(console.error);
