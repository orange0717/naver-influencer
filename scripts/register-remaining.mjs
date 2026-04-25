/**
 * 미매칭 인플루언서 신규 등록
 * node scripts/register-remaining.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envContent = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (match) env[match[1].trim()] = match[2].trim();
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const toRegister = [
  { naverId: 'woorr', name: '개비단대리님', category: '동물/펫', rank: 54 },
  { naverId: 'bbangya', name: '빵야누나', category: '동물/펫', rank: 578 },
  { naverId: 'eutd', name: '읏디', category: '동물/펫', rank: 582 },
  { naverId: 'chodukho_archive_', name: '조덕호아카이브', category: '영화', rank: 297 },
];

for (const t of toRegister) {
  // in.naver.com에서 프로필 정보 가져오기
  console.log(`${t.name} -> in.naver.com/${t.naverId} 조회...`);
  const res = await fetch(`https://in.naver.com/${t.naverId}`);
  if (res.status !== 200) {
    console.log(`  접근 불가: ${res.status}`);
    continue;
  }

  const html = await res.text();
  const nick = html.match(/"nickname"\s*:\s*"([^"]+)"/);
  const img = html.match(/"profileImageUrl"\s*:\s*"([^"]+)"/);
  const sub = html.match(/"subscriberCount"\s*:\s*(\d+)/);
  const intro = html.match(/"introduction"\s*:\s*"([^"]*?)"/);
  const cat = html.match(/"categoryName"\s*:\s*"([^"]+)"/);

  const displayName = nick ? nick[1] : t.name;
  const subscriberCount = sub ? parseInt(sub[1]) : 0;

  console.log(`  이름: ${displayName}, 팬: ${subscriberCount}, 카테고리: ${cat ? cat[1] : '-'}`);

  // DB에 이미 존재하는지 확인
  const { data: existing } = await supabase
    .from('influencers')
    .select('id, display_name, official_naver_rank')
    .eq('naver_id', t.naverId)
    .single();

  if (existing) {
    // 이미 존재하면 공식순위만 업데이트
    console.log(`  이미 존재: ${existing.display_name} (기존 공식순위: ${existing.official_naver_rank})`);
    const { error } = await supabase
      .from('influencers')
      .update({
        official_naver_rank: t.rank,
        official_rank_category: t.category,
      })
      .eq('id', existing.id);
    if (error) console.log(`  업데이트 실패: ${error.message}`);
    else console.log(`  공식순위 업데이트 완료: ${t.category} ${t.rank}위`);
  } else {
    // 신규 등록
    const { error } = await supabase.from('influencers').insert({
      naver_id: t.naverId,
      display_name: displayName,
      profile_url: `https://in.naver.com/${t.naverId}`,
      image_url: img ? img[1] : '',
      introduction: intro ? intro[1] : '',
      subscriber_count: subscriberCount,
      fan_count: subscriberCount,
      total_follower_count: subscriberCount,
      my_keyword_category: cat ? cat[1] : t.category,
      official_naver_rank: t.rank,
      official_rank_category: t.category,
    });
    if (error) console.log(`  등록 실패: ${error.message}`);
    else console.log(`  신규 등록 완료: ${t.category} ${t.rank}위`);
  }

  await new Promise(r => setTimeout(r, 500));
}

// 시그널은 아직 찾지 못함
console.log('\n시그널(텍스투박스, 동물/펫 247위): naver_id 미확인 - 웹검색 결과 없음');

// 최종 현황
const { count } = await supabase
  .from('influencers')
  .select('*', { count: 'exact', head: true })
  .not('official_naver_rank', 'is', null);
console.log(`\n공식 순위 전체: ${count}명`);
