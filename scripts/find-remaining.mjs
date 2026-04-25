/**
 * 남은 미매칭 5명의 naver_id 찾기
 * node scripts/find-remaining.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envContent = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const targets = [
  { name: '개비단대리님', blogName: '개키우는치즈', category: '동물/펫', rank: 54 },
  { name: '시그널', blogName: '텍스투박스', category: '동물/펫', rank: 247 },
  { name: '빵야누나', blogName: '엉망진창와진창', category: '동물/펫', rank: 578 },
  { name: '읏디', blogName: 'EUNJI LEE', category: '동물/펫', rank: 582 },
  { name: '조덕호아카이브', blogName: '조덕호아카이브', category: '영화', rank: 297 },
];

async function checkInfluencerPage(id) {
  try {
    const res = await fetch(`https://in.naver.com/${id}`);
    if (res.status !== 200) return null;
    const html = await res.text();
    if (!html.includes('__PRELOADED_STATE__')) return null;
    const m = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    const sub = html.match(/"subscriberCount"\s*:\s*(\d+)/);
    return {
      naverId: id,
      displayName: m ? m[1] : id,
      subscriberCount: sub ? parseInt(sub[1]) : 0,
    };
  } catch {
    return null;
  }
}

async function searchBlog(query) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=10`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_SEARCH_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_SEARCH_CLIENT_SECRET,
    }
  });
  return await res.json();
}

for (const t of targets) {
  console.log(`\n=== ${t.name} (블로그: ${t.blogName}) ===`);
  let found = false;

  // 1. 블로그명으로 검색
  for (const q of [t.blogName, t.name, `${t.name} 인플루언서 동물`]) {
    const data = await searchBlog(q);
    for (const item of (data.items || [])) {
      const blogLink = item.bloggerlink || '';
      const bloggerName = (item.bloggername || '').replace(/<[^>]+>/g, '');
      if (blogLink.includes('blog.naver.com')) {
        const blogId = blogLink.replace(/.*blog\.naver\.com\//, '').replace(/\/.*/, '');
        // 이름/블로그명 부분 일치 체크
        const nameNorm = t.name.replace(/\s/g, '').toLowerCase();
        const blogNorm = t.blogName.replace(/\s/g, '').toLowerCase();
        const bloggerNorm = bloggerName.replace(/\s/g, '').toLowerCase();

        if (bloggerNorm.includes(nameNorm) || bloggerNorm.includes(blogNorm) ||
            nameNorm.includes(bloggerNorm) || blogNorm.includes(bloggerNorm)) {
          const result = await checkInfluencerPage(blogId);
          if (result) {
            console.log(`  FOUND: in.naver.com/${blogId} -> ${result.displayName} (팬 ${result.subscriberCount})`);
            found = true;
          } else {
            console.log(`  blogId ${blogId} (${bloggerName}) -> 인플루언서 페이지 없음`);
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
    await new Promise(r => setTimeout(r, 300));
    if (found) break;
  }

  // 2. in.naver.com 검색 시도
  if (!found) {
    try {
      const searchUrl = `https://in.naver.com/search/home?keyword=${encodeURIComponent(t.name)}`;
      const sres = await fetch(searchUrl);
      if (sres.status === 200) {
        const html = await sres.text();
        const urlIds = [...html.matchAll(/"urlId"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
        const unique = [...new Set(urlIds)].slice(0, 5);
        if (unique.length > 0) {
          console.log(`  in.naver.com 검색: ${unique.join(', ')}`);
          for (const uid of unique) {
            const result = await checkInfluencerPage(uid);
            if (result) {
              console.log(`  -> ${uid}: ${result.displayName} (팬 ${result.subscriberCount})`);
            }
            await new Promise(r => setTimeout(r, 200));
          }
        } else {
          console.log(`  in.naver.com 검색 결과 없음`);
        }
      }
    } catch (e) {
      console.log(`  검색 에러: ${e.message}`);
    }
  }

  if (!found) {
    console.log(`  -> 자동 매칭 실패, 수동 확인 필요`);
  }
}
