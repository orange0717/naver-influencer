#!/usr/bin/env node
/**
 * keyword_rankings 기반 TOP3 카운트 재집계
 * migration-030-recalculate-all-top3.sql 의 로직을 Node에서 실행
 *
 * 대상: total_keywords > 0 인 모든 인플루언서
 * 소스: keyword_rankings (최근 30일 스냅샷, 키워드당 최신)
 * 필터: influencer_keywords (본인 참여 키워드만)
 *
 * 사용법:
 *   node scripts/recalculate-top3.mjs              # dry-run
 *   node scripts/recalculate-top3.mjs --apply      # 실제 저장
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const isApply = process.argv.includes('--apply');

console.log('=== TOP3 카운트 재집계 ===');
console.log(`모드: ${isApply ? 'APPLY' : 'DRY-RUN'}`);

// 1. influencer_keywords 로 본인 참여 키워드 매핑 수집
console.log('\n[1/4] influencer_keywords 수집 중...');
const ikMap = new Map(); // influencer_id -> Set(keyword_id)
{
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('influencer_keywords')
      .select('influencer_id, keyword_id')
      .range(offset, offset + 999);
    if (error) { console.error('오류:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!ikMap.has(r.influencer_id)) ikMap.set(r.influencer_id, new Set());
      ikMap.get(r.influencer_id).add(r.keyword_id);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
}
console.log(`  influencer_keywords: ${ikMap.size}명 매핑`);

// 2. keyword_rankings 에서 최근 30일 스냅샷, 키워드당 최신만
console.log('\n[2/4] keyword_rankings 최근 30일 수집 중...');
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const latestRankings = new Map(); // key = `${inf_id}:${kw_id}` -> {rank, snapshot_date}
{
  let offset = 0;
  let total = 0;
  while (true) {
    const { data, error } = await sb.from('keyword_rankings')
      .select('influencer_id, keyword_id, rank_position, snapshot_date')
      .gte('snapshot_date', thirtyDaysAgo)
      .order('snapshot_date', { ascending: false })
      .range(offset, offset + 999);
    if (error) { console.error('오류:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const key = `${r.influencer_id}:${r.keyword_id}`;
      if (!latestRankings.has(key)) latestRankings.set(key, r); // 이미 snapshot DESC 정렬이므로 최신
    }
    total += data.length;
    offset += data.length;
    if (data.length < 1000) break;
    if (offset % 10000 === 0) process.stdout.write(`\r  누적 ${total.toLocaleString()}건...`);
  }
  console.log(`\n  최근 30일 스냅샷: ${total.toLocaleString()}건, 유니크 (인플루언서×키워드): ${latestRankings.size.toLocaleString()}`);
}

// 3. 집계
console.log('\n[3/4] 본인 참여 키워드로 필터링 + TOP3 집계...');
const stats = new Map(); // influencer_id -> {top1, top2, top3only, top3_cnt}
for (const [key, r] of latestRankings) {
  const [infId, kwId] = key.split(':');
  const infKw = ikMap.get(infId);
  if (!infKw || !infKw.has(kwId)) continue; // 본인 참여 키워드 아님
  if (!stats.has(infId)) stats.set(infId, { top1: 0, top2: 0, top3only: 0, top3_cnt: 0 });
  const s = stats.get(infId);
  if (r.rank_position === 1) s.top1++;
  if (r.rank_position === 2) s.top2++;
  if (r.rank_position === 3) s.top3only++;
  if (r.rank_position <= 3) s.top3_cnt++;
}
console.log(`  집계된 인플루언서: ${stats.size}명`);

// 4. 업데이트 대상 조회 (total_keywords > 0)
console.log('\n[4/4] influencers 테이블 업데이트...');
const { data: activeInfs } = await sb.from('influencers')
  .select('id, display_name, total_keywords, top1_count, top2_count, top3_count, integrated_top3_count')
  .gt('total_keywords', 0);

let changed = 0, sample = [];
for (const inf of activeInfs || []) {
  const s = stats.get(inf.id) || { top1: 0, top2: 0, top3only: 0, top3_cnt: 0 };
  const newRatio = inf.total_keywords > 0
    ? Math.round(Math.min(s.top3_cnt, inf.total_keywords) / inf.total_keywords * 10000) / 10000
    : 0;
  const needUpdate = s.top1 !== (inf.top1_count || 0)
    || s.top2 !== (inf.top2_count || 0)
    || s.top3only !== (inf.top3_count || 0)
    || s.top3_cnt !== (inf.integrated_top3_count || 0);
  if (!needUpdate) continue;
  if (sample.length < 5) {
    sample.push(`  ${inf.display_name}: top1 ${inf.top1_count||0}→${s.top1}, top2 ${inf.top2_count||0}→${s.top2}, top3 ${inf.top3_count||0}→${s.top3only}, integrated ${inf.integrated_top3_count||0}→${s.top3_cnt}`);
  }
  if (isApply) {
    const { error } = await sb.from('influencers').update({
      top1_count: s.top1,
      top2_count: s.top2,
      top3_count: s.top3only,
      integrated_top3_count: s.top3_cnt,
      top3_ratio: newRatio,
    }).eq('id', inf.id);
    if (error) { console.error(`  오류 [${inf.display_name}]:`, error.message); continue; }
  }
  changed++;
}

console.log('\n=== 결과 ===');
console.log(`  변경 대상: ${changed}명`);
console.log(`  샘플:`);
sample.forEach(s => console.log(s));
if (!isApply) console.log('\n*** dry-run. --apply 로 다시 실행 ***');
