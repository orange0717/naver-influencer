/**
 * 공식 순위 인플루언서의 블로그 최근 포스팅 날짜 체크
 * 사용법: node scripts/check-blog-activity.mjs
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

// 네이버 블로그 최근 포스팅 날짜 가져오기
async function getLastPostDate(naverId) {
  try {
    // Method 1: PostTitleListAsync API
    const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${naverId}&currentPage=1&countPerPage=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': `https://blog.naver.com/${naverId}`,
      },
    });

    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        const postList = data.postList;
        if (postList && postList.length > 0) {
          const addDate = postList[0].addDate; // "2026.4.5." 형식
          if (addDate) {
            const parts = addDate.replace(/\.$/, '').split('.');
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            return new Date(year, month, day);
          }
        }
      } catch {
        // JSON 파싱 실패 시 RSS 폴백
      }
    }

    // Method 2: RSS Feed 폴백
    const rssUrl = `https://rss.blog.naver.com/${naverId}.xml`;
    const rssRes = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (rssRes.ok) {
      const xml = await rssRes.text();
      const pubDateMatch = xml.match(/<item>[\s\S]*?<pubDate>([^<]+)<\/pubDate>/);
      if (pubDateMatch) {
        return new Date(pubDateMatch[1]);
      }
    }

    return null;
  } catch {
    return null;
  }
}

// 딜레이 함수
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // 공식 순위 인플루언서 가져오기
  const { data: influencers, error } = await supabase
    .from('influencers')
    .select('id, naver_id, display_name, official_naver_rank, official_rank_category')
    .not('official_naver_rank', 'is', null)
    .order('official_naver_rank', { ascending: true });

  if (error) {
    console.error('DB 조회 에러:', error.message);
    return;
  }

  console.log(`📋 공식 순위 인플루언서: ${influencers.length}명`);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let checked = 0;
  let inactive = 0;
  let active = 0;
  let failed = 0;
  const inactiveList = [];

  for (const inf of influencers) {
    const lastPost = await getLastPostDate(inf.naver_id);
    checked++;

    if (lastPost) {
      const isOld = lastPost < oneYearAgo;

      // DB 업데이트
      await supabase
        .from('influencers')
        .update({ last_blog_post_at: lastPost.toISOString() })
        .eq('id', inf.id);

      if (isOld) {
        inactive++;
        inactiveList.push({
          rank: inf.official_naver_rank,
          category: inf.official_rank_category,
          name: inf.display_name,
          naverId: inf.naver_id,
          lastPost: lastPost.toLocaleDateString('ko-KR'),
        });
        console.log(`  ❌ ${inf.official_rank_category} ${inf.official_naver_rank}위 ${inf.display_name} — 마지막 포스팅: ${lastPost.toLocaleDateString('ko-KR')}`);
      } else {
        active++;
      }
    } else {
      failed++;
      console.log(`  ⚠️ ${inf.official_rank_category} ${inf.official_naver_rank}위 ${inf.display_name} — 포스팅 날짜 확인 실패`);
    }

    // 진행률 (50명마다)
    if (checked % 50 === 0) {
      console.log(`\n📊 진행: ${checked}/${influencers.length} (활동: ${active}, 비활동: ${inactive}, 실패: ${failed})\n`);
    }

    // 네이버 차단 방지 딜레이 (200ms)
    await delay(200);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 최종 결과:`);
  console.log(`  ✅ 활동 중: ${active}명`);
  console.log(`  ❌ 1년 이상 비활동: ${inactive}명`);
  console.log(`  ⚠️ 확인 실패: ${failed}명`);
  console.log(`${'='.repeat(60)}`);

  if (inactiveList.length > 0) {
    console.log(`\n📝 1년 이상 비활동 인플루언서 목록:`);
    for (const inf of inactiveList) {
      console.log(`  [${inf.category}] ${inf.rank}위 ${inf.name} (@${inf.naverId}) — 마지막: ${inf.lastPost}`);
    }
  }
}

main().catch(console.error);
