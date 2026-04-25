/**
 * 전체 키워드 검색량 bulk 업데이트
 * 네이버 SearchAd API 사용 (5개씩 배치, 1초 간격)
 *
 * 사용법: node scripts/bulk-update-volumes.mjs
 * 진행상황: scripts/.volume-progress.json에 저장 (중단 후 재개 가능)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const SEARCHAD_API_URL = 'https://api.searchad.naver.com/keywordstool';
const BATCH_SIZE = 5;
const DELAY_MS = 500; // API 간격 0.5초
const PROGRESS_FILE = 'scripts/.volume-progress.json';

function mapCompetition(comp) {
  if (comp === '높음') return 'high';
  if (comp === '중간') return 'medium';
  return 'low';
}

async function getSearchVolumes(keywords) {
  const apiKey = process.env.NAVER_API_KEY;
  const secretKey = process.env.NAVER_SECRET_KEY;
  const customerId = process.env.NAVER_CUSTOMER_ID;

  if (!apiKey || !secretKey || !customerId) {
    throw new Error('NAVER_API_KEY/SECRET_KEY/CUSTOMER_ID not set');
  }

  const timestamp = Date.now().toString();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const msgData = encoder.encode(`${timestamp}.GET./keywordstool`);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const params = new URLSearchParams();
  params.set('hintKeywords', keywords.join(','));
  params.set('showDetail', '1');

  const res = await fetch(`${SEARCHAD_API_URL}?${params}`, {
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': apiKey,
      'X-Customer': customerId,
      'X-Signature': sig,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SearchAd API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const result = new Map();
  for (const item of data.keywordList || []) {
    result.set(item.relKeyword, {
      pc: item.monthlyPcQcCnt || 0,
      mobile: item.monthlyMobileQcCnt || 0,
      comp: item.compIdx || '',
    });
  }
  return result;
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { processedIds: [], lastOffset: 0, updated: 0, errors: 0, startedAt: new Date().toISOString() };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function run() {
  console.log('[bulk-update-volumes] Starting...');

  // 모든 키워드 조회 (검색량 미업데이트 우선)
  const allKeywords = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('keyword_challenges')
      .select('id, keyword')
      .eq('is_active', true)
      .or('search_volume_updated_at.is.null,search_volume_monthly.is.null,search_volume_monthly.eq.0')
      .order('participant_count', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) { console.error('DB error:', error.message); break; }
    if (!data || data.length === 0) break;
    allKeywords.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[bulk-update-volumes] Total keywords to process: ${allKeywords.length}`);

  // 이전 진행상황 로드
  const progress = loadProgress();
  const processedSet = new Set(progress.processedIds);
  const remaining = allKeywords.filter(kw => !processedSet.has(kw.id));

  console.log(`[bulk-update-volumes] Already processed: ${processedSet.size}, Remaining: ${remaining.length}`);

  // keyword -> id 매핑 (전체)
  const keywordIdMap = new Map();
  for (const kw of allKeywords) {
    keywordIdMap.set(kw.keyword, kw.id);
  }

  let batchCount = 0;
  const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const kwNames = batch.map(k => k.keyword);
    batchCount++;

    try {
      const volumes = await getSearchVolumes(kwNames);

      // hint 키워드 매칭 + 관련 키워드 중 DB에 있는 것도 업데이트
      for (const [keyword, vol] of volumes) {
        const kwId = keywordIdMap.get(keyword);
        if (kwId && !processedSet.has(kwId)) {
          await supabase.from('keyword_challenges').update({
            search_volume_updated_at: new Date().toISOString(),
            search_volume_pc: vol.pc,
            search_volume_mobile: vol.mobile,
            search_volume_monthly: vol.pc + vol.mobile,
            competition_level: mapCompetition(vol.comp),
          }).eq('id', kwId);

          processedSet.add(kwId);
          progress.processedIds.push(kwId);
          progress.updated++;
        }
      }

      // hint 키워드 중 API 응답에 없는 것도 처리 완료 표시
      for (const kw of batch) {
        if (!processedSet.has(kw.id)) {
          processedSet.add(kw.id);
          progress.processedIds.push(kw.id);
          // 검색량 0으로 표기 (API에서 반환 안 된 경우)
          await supabase.from('keyword_challenges').update({
            search_volume_updated_at: new Date().toISOString(),
            search_volume_monthly: 0,
            search_volume_pc: 0,
            search_volume_mobile: 0,
          }).eq('id', kw.id);
        }
      }

      // 100배치마다 진행상황 저장 + 로그
      if (batchCount % 100 === 0) {
        saveProgress(progress);
        const pct = ((batchCount / totalBatches) * 100).toFixed(1);
        console.log(`[${pct}%] ${batchCount}/${totalBatches} batches, ${progress.updated} updated, ${progress.errors} errors`);
      }
    } catch (err) {
      progress.errors++;
      console.error(`[batch ${batchCount}] Error:`, err.message);

      // 429 Rate Limit → 10초 대기
      if (err.message.includes('429')) {
        console.log('Rate limited, waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));
        i -= BATCH_SIZE; // 재시도
        continue;
      }
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // 최종 저장
  progress.completedAt = new Date().toISOString();
  saveProgress(progress);

  console.log(`\n[bulk-update-volumes] DONE`);
  console.log(`  Updated: ${progress.updated}`);
  console.log(`  Errors: ${progress.errors}`);
  console.log(`  Started: ${progress.startedAt}`);
  console.log(`  Completed: ${progress.completedAt}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
