#!/usr/bin/env node
/**
 * 블로거 순위 주간 갱신 스크립트
 *
 * 블로거 테이블의 rank_score / is_active / global_rank / category_rank / ranked_at 갱신.
 *
 * 실행 전 migration-112 가 Supabase 에 적용되어 있어야 함
 * (step1_score 의 PostgREST 게이트웨이 timeout 수정 — 전체 UPDATE를 id 배치로 분할).
 *
 * 사용법:
 *   node scripts/refresh-blogger-rankings.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function callStep(name, label, args) {
  const t = Date.now();
  const { data, error } = await supabase.rpc(name, args);
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  if (error) {
    console.error(`  [${label}] 실패 (${elapsed}s):`, error.message);
    return { ok: false, elapsed: Number(elapsed) };
  }
  console.log(`  [${label}] 완료 (${elapsed}s) — ${data ?? '?'}건`);
  return { ok: true, data, elapsed: Number(elapsed) };
}

const isTimeoutError = (msg) =>
  /timeout|57014/i.test(msg ?? '');

/**
 * step1_score 를 id 배치로 나눠 순차 호출.
 * - 게이트웨이 timeout(~120초)에 걸리면 배치 크기를 절반으로 줄여 같은 구간을 재시도.
 * - 그 외 에러는 최대 2회까지 그대로 재시도.
 */
async function runStep1Batched() {
  console.log('  [1/4 점수 재계산] 배치 시작');
  let afterId = null;
  let batchSize = 3000;
  let totalUpdated = 0;
  let batchNo = 0;

  for (;;) {
    const { data: ids, error: pageError } = await supabase.rpc('list_blogger_ids_after', {
      p_after_id: afterId,
      p_limit: batchSize,
    });
    if (pageError) {
      console.error(`  [1/4 점수 재계산] id 조회 실패 (batch #${batchNo}):`, pageError.message);
      return false;
    }
    if (!ids || ids.length === 0) break;

    batchNo += 1;
    const blogIds = ids.map((r) => r.id);
    let attempt = 0;
    let succeeded = false;

    while (attempt < 3 && !succeeded) {
      attempt += 1;
      const t = Date.now();
      const { data, error } = await supabase.rpc('refresh_blogger_rankings_step1_score_batch', {
        p_blogger_ids: blogIds,
      });
      const elapsed = ((Date.now() - t) / 1000).toFixed(1);

      if (!error) {
        console.log(`  [1/4 점수 재계산] batch #${batchNo} (${blogIds.length}명, ${elapsed}s) — ${data ?? '?'}건`);
        totalUpdated += data ?? 0;
        succeeded = true;
        break;
      }

      if (isTimeoutError(error.message) && batchSize > 200) {
        batchSize = Math.max(200, Math.floor(batchSize / 2));
        console.warn(`  [1/4 점수 재계산] batch #${batchNo} 타임아웃 (${elapsed}s) — 배치 크기 축소 후 재시도: ${batchSize}`);
        break; // 같은 afterId 에서 더 작은 batchSize 로 재조회
      }

      console.error(`  [1/4 점수 재계산] batch #${batchNo} 시도 ${attempt}/3 실패 (${elapsed}s):`, error.message);
      if (attempt >= 3) return false;
    }

    if (succeeded) {
      afterId = blogIds[blogIds.length - 1];
    }
    // succeeded=false (타임아웃으로 배치 축소) 인 경우 afterId 갱신 없이 루프 재진입
  }

  console.log(`  [1/4 점수 재계산] 완료 — 총 ${totalUpdated}건 (${batchNo}개 배치)`);
  return true;
}

async function main() {
  console.log('=== 블로거 순위 갱신 (4단계 분할, step1은 id 배치) ===');
  const startedAt = Date.now();

  const ok1 = await runStep1Batched();
  const ok2 = ok1 && (await callStep('refresh_blogger_rankings_step2_global', '2/4 전체 순위')).ok;
  const ok3 = ok2 && (await callStep('refresh_blogger_rankings_step3_inactive', '3/4 비활성 NULL')).ok;
  const ok4 = ok3 && (await callStep('refresh_blogger_rankings_step4_category', '4/4 카테고리 순위')).ok;

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (ok1 && ok2 && ok3 && ok4) {
    console.log(`\n완료 (총 ${elapsed}s)`);
  } else {
    console.error(`\n일부 단계 실패 (총 ${elapsed}s)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
