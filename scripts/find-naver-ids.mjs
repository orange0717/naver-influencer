/**
 * 미매칭 인플루언서의 naver_id 찾기 + DB 신규 등록
 * node scripts/find-naver-ids.mjs
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

// 미매칭 후보 + 시도할 ID 목록
const candidates = [
  { name: '울산아저씨', tryIds: ['iwillbes27', 'ulsanajeossi'], category: '동물/펫', rank: 36, fanText: '8천명' },
  { name: '개비��대리님', tryIds: ['gaebidan', 'gaebidandaelinim'], category: '동물/펫', rank: 54, fanText: '2천명' },
  { name: '시그널', tryIds: ['signal', 'signalpet'], category: '동물/펫', rank: 247, fanText: '4천명' },
  { name: '하오TV', tryIds: ['haotv', 'haosonmh'], category: '동물/펫', rank: 467, fanText: '2천명' },
  { name: '빵야누나', tryIds: ['ppangyanuna', 'bbangyanuna'], category: '동물/펫', rank: 578, fanText: '2천명' },
  { name: '읏디', tryIds: ['desafio_jp', 'euddi'], category: '동물/펫', rank: 582, fanText: '1천명' },
  { name: '오피스냥라이프', tryIds: ['office_cat_life', 'officenyanglife'], category: '동물/펫', rank: 697, fanText: '4천명' },
  { name: '모토리카[MotoriQa]', tryIds: ['eodlf0725', 'motoriqa'], category: '자동차', rank: 261, fanText: '4천명' },
  { name: '화정 저스트드럼', tryIds: ['oneclickjum', 'justdrum'], category: '대중음악', rank: 65, fanText: '3천명' },
  { name: '조덕호아카��브', tryIds: ['legendukho', 'jodukhoarchive'], category: '영화', rank: 297, fanText: '1천명' },
];

function parseFanCount(text) {
  if (!text) return 0;
  const num = parseFloat(text.replace(/[^0-9.]/g, ''));
  if (text.includes('만')) return Math.round(num * 10000);
  if (text.includes('천')) return Math.round(num * 1000);
  return Math.round(num) || 0;
}

async function checkInfluencerPage(naverId) {
  try {
    const res = await fetch(`https://in.naver.com/${naverId}`, { redirect: 'follow' });
    if (res.status !== 200) return null;
    const html = await res.text();
    // Check for influencer profile page markers
    if (html.includes('__PRELOADED_STATE__')) {
      // Extract display name from preloaded state
      const match = html.match(/"nickname"\s*:\s*"([^"]+)"/);
      const imgMatch = html.match(/"profileImageUrl"\s*:\s*"([^"]+)"/);
      const subMatch = html.match(/"subscriberCount"\s*:\s*(\d+)/);
      const introMatch = html.match(/"introduction"\s*:\s*"([^"]*?)"/);
      return {
        naverId,
        displayName: match ? match[1] : naverId,
        imageUrl: imgMatch ? imgMatch[1] : '',
        subscriberCount: subMatch ? parseInt(subMatch[1]) : 0,
        introduction: introMatch ? introMatch[1] : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

console.log('미매칭 인플루언서 naver_id 조회 시작...\n');

const results = [];
for (const c of candidates) {
  let found = null;
  for (const tryId of c.tryIds) {
    console.log(`  ${c.name} -> in.naver.com/${tryId} 확인 중...`);
    found = await checkInfluencerPage(tryId);
    if (found) {
      console.log(`    -> 발견: ${found.displayName} (팬 ${found.subscriberCount})`);
      break;
    } else {
      console.log(`    -> 없음`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // 네이버 검색 API로도 시도
  if (!found) {
    console.log(`  ${c.name} -> 네이버 검색 API로 시도...`);
    try {
      const query = encodeURIComponent(c.name + ' 인플루언서');
      const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?query=${query}&display=10`, {
        headers: {
          'X-Naver-Client-Id': env.NAVER_SEARCH_CLIENT_ID,
          'X-Naver-Client-Secret': env.NAVER_SEARCH_CLIENT_SECRET,
        }
      });
      const data = await res.json();
      // bloggerlink에서 in.naver.com 링크 찾기
      for (const item of (data.items || [])) {
        if (item.bloggerlink && item.bloggerlink.includes('in.naver.com')) {
          const id = item.bloggerlink.replace(/.*in\.naver\.com\//, '').replace(/\/.*/, '');
          if (id) {
            found = await checkInfluencerPage(id);
            if (found) {
              console.log(`    -> 검색으로 발견: in.naver.com/${id} (${found.displayName})`);
              break;
            }
          }
        }
        // blog.naver.com/{id} -> in.naver.com/{id} 시도
        if (item.bloggerlink && item.bloggerlink.includes('blog.naver.com')) {
          const id = item.bloggerlink.replace(/.*blog\.naver\.com\//, '').replace(/\/.*/, '');
          if (id && !c.tryIds.includes(id)) {
            found = await checkInfluencerPage(id);
            if (found) {
              console.log(`    -> 블로그ID로 발견: in.naver.com/${id} (${found.displayName})`);
              break;
            }
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    } catch (e) {
      console.log(`    -> 검색 실패: ${e.message}`);
    }
  }

  results.push({
    ...c,
    found,
  });
  await new Promise(r => setTimeout(r, 500));
}

console.log('\n=== 결과 ===');
const foundList = results.filter(r => r.found);
const notFoundList = results.filter(r => !r.found);

console.log(`발견: ${foundList.length}명`);
for (const r of foundList) {
  console.log(`  ${r.category} ${r.rank}위 ${r.name} -> ${r.found.naverId}`);
}
console.log(`미발견: ${notFoundList.length}명`);
for (const r of notFoundList) {
  console.log(`  ${r.category} ${r.rank}위 ${r.name}`);
}

// DB INSERT
if (foundList.length > 0) {
  console.log('\nDB 신규 등록 시작...');
  for (const r of foundList) {
    const f = r.found;
    const { error } = await supabase.from('influencers').upsert({
      naver_id: f.naverId,
      display_name: f.displayName || r.name,
      profile_url: `https://in.naver.com/${f.naverId}`,
      image_url: f.imageUrl || '',
      introduction: f.introduction || '',
      subscriber_count: f.subscriberCount || parseFanCount(r.fanText),
      fan_count: f.subscriberCount || parseFanCount(r.fanText),
      total_follower_count: f.subscriberCount || parseFanCount(r.fanText),
      my_keyword_category: r.category,
      official_naver_rank: r.rank,
      official_rank_category: r.category,
    }, { onConflict: 'naver_id' });

    if (error) {
      console.log(`  실패: ${r.name} - ${error.message}`);
    } else {
      console.log(`  등록: ${r.name} -> ${f.naverId} (${r.category} ${r.rank}위)`);
    }
  }
}

// 미발견 인플루언서는 이름 기반으로 등록 (naver_id를 임시로 설정)
if (notFoundList.length > 0) {
  console.log('\n미발견 인플루언서 목록 (수동 확인 필요):');
  for (const r of notFoundList) {
    console.log(`  ${r.category} ${r.rank}위 ${r.name} (${r.fanText})`);
  }
}

// 최종 확인
const { count } = await supabase.from('influencers').select('*', { count: 'exact', head: true }).not('official_naver_rank', 'is', null);
console.log(`\n공식 순위 전체: ${count}명`);
