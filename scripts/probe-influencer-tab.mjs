// 인플루언서 탭에서 orangelibrary_ handle이 실제로 어떻게(혹은 왜 안) 잡히는지 raw를 뜬다.
// 1) start 페이지네이션 동작 여부  2) in.naver.com 링크 등장 순서  3) handle 매칭 위치
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Referer': 'https://search.naver.com/',
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TARGETS = [
  { keyword: '쇼펜하우어 아포리즘', blogId: 'orangelibrary_', postId: '224361005217', dbRank: 15 },
  { keyword: '카피라이팅', blogId: 'orangelibrary_', postId: '224362420704', dbRank: 18 },
];

for (const t of TARGETS) {
  const base = `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(t.keyword)}`;
  console.log(`\n========== "${t.keyword}" (인플루언서 탭, target handle=${t.blogId}, DB ${t.dbRank}위) ==========`);
  for (let page = 1; page <= 3; page++) {
    const start = (page - 1) * 10 + 1;
    const url = page === 1 ? base : `${base}&start=${start}`;
    const res = await fetch(url, { headers: HEADERS });
    console.log(`\n--- page ${page} (start=${start}) status=${res.status}  htmlLen=${res.ok ? '?' : '-'} ---`);
    if (!res.ok) { await sleep(700); continue; }
    const html = await res.text();

    // in.naver.com/{handle}/contents/internal/{id} 등장 순서
    const inRegex = /in\.naver\.com\/([a-zA-Z0-9_.-]+)\/contents\/internal\/(\d+)/g;
    const seen = new Set();
    let m, idx = 0, targetHit = null;
    const handles = [];
    while ((m = inRegex.exec(html)) !== null) {
      const key = `${m[1]}/${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      idx++;
      handles.push(m[1]);
      if (m[1].toLowerCase() === t.blogId.toLowerCase() && targetHit === null) targetHit = { idx, contentId: m[2] };
    }
    console.log(`  in.naver 콘텐츠 ${idx}개, handle 목록: ${handles.slice(0, 12).join(', ')}${handles.length > 12 ? ' …' : ''}`);
    console.log(`  target handle 매칭: ${targetHit ? `등장#${targetHit.idx} (contentId=${targetHit.contentId})` : '없음'}`);

    // blog.naver.com data-cr-on 폴백도 존재하는지
    const $ = cheerio.load(html);
    let blogLinks = 0, targetBlog = null, g = 0;
    const seenB = new Set();
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const bm = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
      if (!bm) return;
      const key = `${bm[1]}/${bm[2]}`;
      if (seenB.has(key)) return;
      seenB.add(key);
      g++;
      blogLinks++;
      if (bm[1].toLowerCase() === t.blogId.toLowerCase() && bm[2] === t.postId && targetBlog === null) targetBlog = g;
    });
    console.log(`  blog.naver 링크 ${blogLinks}개, target postId 매칭: ${targetBlog ? `${targetBlog}번째` : '없음'}`);
    await sleep(800);
  }
}
console.log('\n조사 완료');
