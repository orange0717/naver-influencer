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

async function main() {
  console.log('=== 블로거 순위 갱신 ===');
  const startedAt = Date.now();

  const { data, error } = await supabase.rpc('refresh_blogger_rankings');
  if (error) {
    console.error('RPC 오류:', error.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const row = Array.isArray(data) ? data[0] : data;
  console.log(`완료 (${elapsed}s)`);
  console.log(`  총 블로거: ${row?.total_ranked ?? '?'}명`);
  console.log(`  활성 블로거: ${row?.active_count ?? '?'}명`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
