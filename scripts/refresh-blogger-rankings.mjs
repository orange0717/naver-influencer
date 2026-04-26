#!/usr/bin/env node
/**
 * 블로거 순위 주간 갱신 스크립트
 *
 * Supabase RPC `refresh_blogger_rankings()` 만 호출한다.
 * 블로거 테이블의 rank_score / is_active / global_rank / category_rank / ranked_at 갱신.
 *
 * 실행 전 migration-062 가 Supabase 에 적용되어 있어야 함
 * (migration-055 의 UPDATE WHERE 누락 버그 수정본).
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

async function callStep(name, label) {
  const t = Date.now();
  const { data, error } = await supabase.rpc(name);
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  if (error) {
    console.error(`  [${label}] 실패 (${elapsed}s):`, error.message);
    return false;
  }
  console.log(`  [${label}] 완료 (${elapsed}s) — ${data ?? '?'}건`);
  return true;
}

async function main() {
  console.log('=== 블로거 순위 갱신 (4단계 분할) ===');
  const startedAt = Date.now();

  // migration-073 의 분할 RPC 4개 순차 호출
  const ok1 = await callStep('refresh_blogger_rankings_step1_score',    '1/4 점수 재계산');
  const ok2 = ok1 && await callStep('refresh_blogger_rankings_step2_global',   '2/4 전체 순위');
  const ok3 = ok2 && await callStep('refresh_blogger_rankings_step3_inactive', '3/4 비활성 NULL');
  const ok4 = ok3 && await callStep('refresh_blogger_rankings_step4_category', '4/4 카테고리 순위');

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
