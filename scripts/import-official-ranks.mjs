/**
 * 공식 네이버 인플루언서 순위 데이터 임포트
 * 사용법: node scripts/import-official-ranks.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env.local에서 환경변수 읽기
const envContent = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// xlsx 파일을 읽기 위해 동적 import
const XLSXModule = await import('xlsx');
const XLSX = XLSXModule.default || XLSXModule;

async function importFile(filePath, rankColumn, categoryName) {
  console.log(`\n📂 파일: ${filePath}`);
  console.log(`📊 카테고리: ${categoryName}, 순위 컬럼: ${rankColumn}`);

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`📋 총 ${rows.length}행 읽음`);

  // DB에서 모든 인플루언서 display_name 가져오기
  let allInfluencers = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) { console.error('DB 조회 에러:', error.message); return; }
    allInfluencers.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`🗃️  DB 인플루언서: ${allInfluencers.length}명`);

  // display_name → id 매핑 (정규화: 공백/특수문자 제거)
  const normalize = (s) => s?.replace(/\s+/g, '').replace(/[^\w가-힣]/g, '').toLowerCase() || '';
  const nameMap = new Map();
  for (const inf of allInfluencers) {
    nameMap.set(normalize(inf.display_name), inf);
    nameMap.set(normalize(inf.naver_id), inf);
  }

  let matched = 0;
  let notFound = [];
  let updates = [];

  for (const row of rows) {
    const name = row['인플루언서명'];
    const rank = row[rankColumn];
    if (!name || !rank || isNaN(rank)) continue;

    const key = normalize(name);
    const inf = nameMap.get(key);

    if (inf) {
      updates.push({
        id: inf.id,
        official_naver_rank: Math.round(rank),
        official_rank_category: categoryName,
      });
      matched++;
    } else {
      notFound.push({ name, rank: Math.round(rank) });
    }
  }

  console.log(`✅ 매칭: ${matched}명`);
  console.log(`❌ 미매칭: ${notFound.length}명`);

  if (notFound.length > 0 && notFound.length <= 30) {
    console.log('미매칭 목록:', notFound.map(n => `${n.rank}위 ${n.name}`).join(', '));
  } else if (notFound.length > 30) {
    console.log('미매칭 상위 20:', notFound.slice(0, 20).map(n => `${n.rank}위 ${n.name}`).join(', '));
  }

  // 배치 업데이트 (50개씩)
  const batchSize = 50;
  let successCount = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    for (const item of batch) {
      const { error } = await supabase
        .from('influencers')
        .update({
          official_naver_rank: item.official_naver_rank,
          official_rank_category: item.official_rank_category,
        })
        .eq('id', item.id);
      if (error) {
        console.error(`업데이트 실패 (${item.id}):`, error.message);
      } else {
        successCount++;
      }
    }
  }
  console.log(`💾 DB 업데이트 완료: ${successCount}/${updates.length}명`);
}

// === 도서 임포트 ===
await importFile(
  '/Users/orange/Downloads/brand_connect_book_creators.xlsx',
  '도서랭킹',
  '도서'
);

// === 경제 임포트 ===
await importFile(
  '/Users/orange/Downloads/brand_connect_econ_creators (1).xlsx',
  '경제/비즈니스 랭킹',
  '경제·비즈니스'
);

// === 육아 임포트 ===
await importFile(
  '/Users/orange/Downloads/네이버_브랜드커넥트_육아_인플루언서.xlsx',
  '랭킹',
  '육아'
);

// 결과 확인
const { count } = await supabase
  .from('influencers')
  .select('*', { count: 'exact', head: true })
  .not('official_naver_rank', 'is', null);
console.log(`\n🎯 공식 순위가 있는 인플루언서: ${count}명`);
