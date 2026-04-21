#!/usr/bin/env node
/**
 * polite-crawler 키워드 풀 확장 스크립트
 *
 * keyword_challenges 테이블에서 keyword 를 추출해
 * scripts/keywords-all.json 에 병합 (중복 제거).
 *
 * 기본 동작: dry-run. --apply 를 주어야 파일 저장.
 *
 * 사용법:
 *   node scripts/expand-keyword-pool.mjs                  # dry-run
 *   node scripts/expand-keyword-pool.mjs --apply --max 2000  # 상위 2000개 병합
 *   node scripts/expand-keyword-pool.mjs --apply --all    # 전체 keyword_challenges
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POOL_FILE = resolve(__dirname, 'keywords-all.json');

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

const args = process.argv.slice(2);
const hasArg = (n) => args.includes(n);
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const isApply = hasArg('--apply');
const isAll = hasArg('--all');
const maxKeywords = getArg('--max') ? parseInt(getArg('--max')) : 2000;

async function main() {
  console.log('=== 키워드 풀 확장 ===');

  // 기존 풀 로드
  let existing = [];
  if (existsSync(POOL_FILE)) {
    try { existing = JSON.parse(readFileSync(POOL_FILE, 'utf-8')); } catch {}
  }
  if (!Array.isArray(existing)) existing = [];
  const existingSet = new Set(existing.map(s => String(s).trim()).filter(Boolean));
  console.log(`기존 풀: ${existingSet.size}개`);

  // keyword_challenges 조회 (participant_count desc)
  const rows = [];
  const target = isAll ? Infinity : maxKeywords;
  let offset = 0;
  const pageSize = 1000;
  while (rows.length < target) {
    const to = Math.min(offset + pageSize, offset + (target - rows.length)) - 1;
    const { data, error } = await supabase
      .from('keyword_challenges')
      .select('keyword, participant_count')
      .eq('is_active', true)
      .order('participant_count', { ascending: false })
      .range(offset, to);
    if (error) { console.error('DB 오류:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    rows.push(...data);
    offset += data.length;
    if (data.length < pageSize) break;
  }
  console.log(`keyword_challenges 조회: ${rows.length}개`);

  // 후보 정제 (1~30자 한글/영문/숫자만)
  const reValid = /^[가-힣a-zA-Z0-9\s]{1,30}$/;
  const candidates = new Set();
  for (const r of rows) {
    const kw = String(r.keyword || '').trim();
    if (!kw || kw.length > 30) continue;
    if (!reValid.test(kw)) continue;
    candidates.add(kw);
  }

  // 신규만 추출
  const toAdd = [];
  for (const kw of candidates) {
    if (!existingSet.has(kw)) toAdd.push(kw);
  }

  console.log(`추가 가능 신규: ${toAdd.length}개`);
  console.log('샘플 10개:', toAdd.slice(0, 10));

  if (!isApply) {
    console.log('\n*** dry-run — 실제 저장하려면 --apply ***');
    return;
  }

  // 병합 후 저장
  const merged = [...existingSet, ...toAdd];
  writeFileSync(POOL_FILE, JSON.stringify(merged, null, 2));
  console.log(`저장 완료: ${POOL_FILE}`);
  console.log(`  기존 ${existingSet.size}개 → ${merged.length}개 (+${toAdd.length}개)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
