/**
 * 여행 공식 인플루언서 순위 임포트 (Brand Connect 텍스트 파싱)
 *
 * 사용법:
 *   1. 브랜드커넥트 페이지에서 전체 텍스트를 복사
 *   2. scripts/travel-ranks.txt 로 저장
 *   3. node scripts/import-travel-ranks.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env.local 환경변수
const envContent = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Brand Connect 텍스트에서 (인플루언서명, 순위) 추출
 */
function parseText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = new Map(); // 중복 제거용

  for (let i = 0; i < lines.length; i++) {
    // "인플루언서" 라벨 찾기
    if (lines[i] === '인플루언서') {
      const name = lines[i + 1];
      // "여행 랭킹" 찾기 (인플루언서명 다음 줄)
      if (name && lines[i + 2] === '여행 랭킹') {
        const rankText = lines[i + 3];
        if (rankText && rankText !== '-') {
          const rankMatch = rankText.match(/^([\d,]+)위$/);
          if (rankMatch) {
            const rank = parseInt(rankMatch[1].replace(/,/g, ''));
            if (!isNaN(rank) && !results.has(name)) {
              results.set(name, rank);
            }
          }
        }
      }
    }
  }

  return Array.from(results.entries()).map(([name, rank]) => ({ name, rank }));
}

// 파일 읽기
const filePath = resolve(import.meta.dirname, 'travel-ranks.txt');
let rawText;
try {
  rawText = readFileSync(filePath, 'utf-8');
} catch {
  console.error('파일을 찾을 수 없습니다:', filePath);
  console.error('브랜드커넥트 페이지 텍스트를 scripts/travel-ranks.txt 로 저장해주세요.');
  process.exit(1);
}

const parsed = parseText(rawText);
console.log(`파싱 완료: ${parsed.length}명 (순위 있는 인플루언서)`);

if (parsed.length === 0) {
  console.error('파싱된 데이터가 없습니다. 텍스트 형식을 확인해주세요.');
  process.exit(1);
}

// 상위 10명 미리보기
console.log('\n상위 10명:');
parsed.sort((a, b) => a.rank - b.rank);
for (const p of parsed.slice(0, 10)) {
  console.log(`  ${p.rank}위: ${p.name}`);
}

// DB에서 모든 인플루언서 가져오기
let allInfluencers = [];
let page = 0;
const pageSize = 1000;
while (true) {
  const { data, error } = await supabase
    .from('influencers')
    .select('id, naver_id, display_name')
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) { console.error('DB 조회 에러:', error.message); process.exit(1); }
  allInfluencers.push(...data);
  if (data.length < pageSize) break;
  page++;
}
console.log(`\nDB 인플루언서: ${allInfluencers.length}명`);

// 이름 정규화 매핑
const normalize = (s) => s?.replace(/\s+/g, '').replace(/[^\w가-힣]/g, '').toLowerCase() || '';
const nameMap = new Map();
for (const inf of allInfluencers) {
  nameMap.set(normalize(inf.display_name), inf);
  nameMap.set(normalize(inf.naver_id), inf);
}

// 매칭
let matched = 0;
let notFound = [];
let updates = [];

for (const { name, rank } of parsed) {
  const key = normalize(name);
  const inf = nameMap.get(key);

  if (inf) {
    updates.push({
      id: inf.id,
      official_naver_rank: rank,
      official_rank_category: '여행',
    });
    matched++;
  } else {
    notFound.push({ name, rank });
  }
}

console.log(`\n매칭: ${matched}명`);
console.log(`미매칭: ${notFound.length}명`);

if (notFound.length > 0 && notFound.length <= 50) {
  console.log('미매칭 목록:');
  for (const n of notFound) {
    console.log(`  ${n.rank}위 ${n.name}`);
  }
} else if (notFound.length > 50) {
  console.log('미매칭 상위 30:');
  for (const n of notFound.slice(0, 30)) {
    console.log(`  ${n.rank}위 ${n.name}`);
  }
}

// DB 업데이트
console.log(`\nDB 업데이트 시작...`);
let successCount = 0;
for (const item of updates) {
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
console.log(`DB 업데이트 완료: ${successCount}/${updates.length}명`);

// 최종 확인
const { count } = await supabase
  .from('influencers')
  .select('*', { count: 'exact', head: true })
  .not('official_naver_rank', 'is', null);
console.log(`\n공식 순위가 있는 전체 인플루언서: ${count}명`);
