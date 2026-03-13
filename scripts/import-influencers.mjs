#!/usr/bin/env node
/**
 * 데이터랩툴즈 xlsx에서 인플루언서 데이터를 Supabase DB에 import
 *
 * 사용법:
 *   node scripts/import-influencers.mjs [파일경로]
 *   node scripts/import-influencers.mjs --dry-run  # DB 저장 안 함
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 환경변수 로드 ───

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local 파일을 찾을 수 없습니다.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let val = trimmed.slice(eqIdx + 1);
    // 따옴표 제거
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// ─── xlsx 파싱 (openpyxl 대신 순수 JS) ───

async function parseXlsx(filePath) {
  // dynamic import xlsx
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default || xlsxModule;
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const influencers = [];
  // 첫 행은 헤더: 채널타입, 채널아이디, 닉네임, 주제, 가입일, 연혁, 유효콘텐츠 순위, 유효콘텐츠 수
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] !== 'NINFL' || !row[1]) continue;

    const naverId = String(row[1]).trim();
    const displayName = String(row[2] || '').trim();
    const category = String(row[3] || '').trim();
    const joinDate = row[4] || null;
    const history = String(row[5] || '').trim();
    const contentRank = parseNum(row[6]);
    const contentCount = parseNum(row[7]);

    influencers.push({
      naver_id: naverId,
      display_name: displayName || naverId,
      profile_url: `https://in.naver.com/${naverId}`,
      category: category,
      my_keyword_category: category,
      stats_summary: history !== '-' && history ? history : '',
      last_crawled_at: new Date().toISOString(),
    });
  }

  return influencers;
}

function parseNum(val) {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/,/g, '');
  return parseInt(s, 10) || 0;
}

// ─── DB upsert ───

async function upsertInfluencers(influencers, dryRun = false) {
  const BATCH_SIZE = 100;
  let totalSaved = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < influencers.length; i += BATCH_SIZE) {
    const batch = influencers.slice(i, i + BATCH_SIZE);

    if (dryRun) {
      totalSaved += batch.length;
      continue;
    }

    const { data, error } = await supabase
      .from('influencers')
      .upsert(batch, {
        onConflict: 'naver_id',
        ignoreDuplicates: false,
      })
      .select('id');

    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`);
      totalFailed += batch.length;
    } else {
      totalSaved += batch.length;
    }

    // 진행 로그
    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= influencers.length) {
      const pct = (Math.min(i + BATCH_SIZE, influencers.length) / influencers.length * 100).toFixed(1);
      console.log(`  [${pct}%] ${Math.min(i + BATCH_SIZE, influencers.length)}/${influencers.length} 처리됨`);
    }
  }

  return { totalSaved, totalNew, totalUpdated, totalFailed };
}

// ─── 메인 ───

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // 파일 경로 찾기
  let filePath = args.find(a => !a.startsWith('--'));
  if (!filePath) {
    // 기본 경로
    filePath = '/Users/orange/Downloads/데이터랩툴즈(datalab.tools)-exports-2025_12_27_07_00_52 (1).xlsx';
  }

  if (!existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  인플루언서 데이터 Import (데이터랩툴즈)     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  if (dryRun) console.log('🔍 DRY RUN 모드');
  console.log(`📁 파일: ${filePath}`);

  // 현재 DB 상태
  const { count: beforeCount } = await supabase
    .from('influencers')
    .select('id', { count: 'exact', head: true });
  console.log(`📊 현재 DB 인플루언서: ${(beforeCount || 0).toLocaleString()}명`);

  // xlsx 파싱
  console.log('\n📖 xlsx 파싱 중...');
  const influencers = await parseXlsx(filePath);
  console.log(`   ${influencers.length.toLocaleString()}명 파싱 완료`);

  // 카테고리별 통계
  const catMap = {};
  for (const inf of influencers) {
    catMap[inf.category] = (catMap[inf.category] || 0) + 1;
  }
  console.log('\n📋 카테고리별:');
  for (const [cat, count] of Object.entries(catMap).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count}명`);
  }

  // DB upsert
  console.log('\n💾 DB upsert 시작...');
  const result = await upsertInfluencers(influencers, dryRun);

  // 최종 DB 상태
  const { count: afterCount } = await supabase
    .from('influencers')
    .select('id', { count: 'exact', head: true });

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║               Import 완료                    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  파싱:       ${influencers.length.toLocaleString()}명`);
  console.log(`║  저장:       ${result.totalSaved.toLocaleString()}명`);
  console.log(`║  실패:       ${result.totalFailed.toLocaleString()}명`);
  console.log(`║  DB 변화:    ${(beforeCount || 0).toLocaleString()} → ${(afterCount || 0).toLocaleString()}명`);
  console.log(`║  신규 추가:  ${((afterCount || 0) - (beforeCount || 0)).toLocaleString()}명`);
  console.log('╚══════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
