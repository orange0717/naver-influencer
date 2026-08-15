// 노출로 잡힌 keyword_rank_lookups 행을 네이버에서 실제 재조회해 DB 값과 대조한다.
// keyword-rank-check.ts의 fetch·정규식 로직을 그대로 재현(캐시 의존성 제거).
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

// in.naver.com/{handle}/contents/internal/{id} 등장순서 매칭
function matchInfluencerContentByHandle(html, blogIdLower, rankBase) {
  const inRegex = /in\.naver\.com\/([a-zA-Z0-9_.-]+)\/contents\/internal\/(\d+)/g;
  const seen = new Set();
  let rank = rankBase;
  let m;
  while ((m = inRegex.exec(html)) !== null) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rank++;
    if (m[1].toLowerCase() === blogIdLower) return rank;
  }
  return null;
}

async function checkTab(kind, query, blogId, postId) {
  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId || '');
  const base =
    kind === 'blog' ? `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`
    : kind === 'influencer' ? `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(query)}`
    : `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(query)}`;

  let anyPageLoaded = false;
  for (let page = 1; page <= 3; page++) {
    const start = (page - 1) * 10 + 1;
    const url = page === 1 ? base : `${base}&start=${start}`;
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) { console.warn(`  status=${res.status} page=${page}`); continue; }
      const html = await res.text();
      anyPageLoaded = true;

      // view/blog: blog.naver.com data-cr-on 정밀 매칭
      if (kind === 'view' || kind === 'blog') {
        const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
        const seen = new Set();
        let mt;
        while ((mt = rankRegex.exec(html)) !== null) {
          const [, lb, lp, rs] = mt;
          const key = `${lb}/${lp}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (lb.toLowerCase() === blogIdLower && lp === postIdStr) {
            return { exposed: true, rank: start + parseInt(rs) - 1, via: 'blog정밀(postId일치)' };
          }
        }
        // 폴백: <a> href 수동 카운트
        if (seen.size === 0) {
          const $ = cheerio.load(html);
          const seenFb = new Set();
          let g = (page - 1) * 10;
          let found = null;
          $('a').each((_, el) => {
            if (found !== null) return;
            const href = $(el).attr('href') || '';
            const m = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
            if (!m) return;
            const key = `${m[1]}/${m[2]}`;
            if (seenFb.has(key)) return;
            seenFb.add(key);
            g++;
            if (m[1].toLowerCase() === blogIdLower && m[2] === postIdStr) found = g;
          });
          if (found !== null) return { exposed: true, rank: found, via: 'href폴백(postId일치)' };
        }
      }

      // view/influencer: in.naver.com handle 등장순서 매칭 (postId 무관 — handle만 일치하면 잡힘)
      if (kind === 'view' || kind === 'influencer') {
        const inRank = matchInfluencerContentByHandle(html, blogIdLower, (page - 1) * 10);
        if (inRank !== null) return { exposed: true, rank: inRank, via: 'in.naver근사(handle만·postId무관)' };
      }
    } catch (err) {
      console.error(`  예외 page=${page}:`, err.message);
    }
    if (page < 3) await sleep(500);
  }
  if (!anyPageLoaded) return { exposed: false, rank: null, error: true };
  return { exposed: false, rank: null };
}

// DB에서 노출로 잡힌 7건 (dump-exposed-rank-data.mjs 결과)
const CASES = [
  { blogId: 'orangelibrary_', keyword: '노자', postId: '224358439190', tab: 'view', dbRank: 18 },
  { blogId: 'orangelibrary_', keyword: '미라클모닝루틴', postId: '224358895966', tab: 'blog', dbRank: 25 },
  { blogId: 'orangelibrary_', keyword: '큰댁', postId: '224359621676', tab: 'view', dbRank: 14 },
  { blogId: 'orangelibrary_', keyword: '쇼펜하우어 아포리즘', postId: '224361005217', tab: 'influencer', dbRank: 15 },
  { blogId: 'orangelibrary_', keyword: '카피라이팅', postId: '224362420704', tab: 'influencer', dbRank: 18 },
  { blogId: 'jellapick', keyword: '마스크팩', postId: '224362935967', tab: 'blog', dbRank: 22 },
  { blogId: 'orangelibrary_', keyword: '아포리즘', postId: '224368215555', tab: 'view', dbRank: 20 },
];

const tabLabel = { view: '통합검색', blog: '블로그탭', influencer: '인플루언서' };

console.log('=== 노출 케이스 네이버 실시간 재조회 대조 ===\n');
for (const c of CASES) {
  const live = await checkTab(c.tab, c.keyword, c.blogId, c.postId);
  let verdict;
  if (live.error) verdict = '⚠️ 재조회 실패(일시적 오류) — 판정보류';
  else if (live.exposed && live.rank === c.dbRank) verdict = '✅ 완전일치';
  else if (live.exposed) verdict = `△ 노출은 일치, 순위 이동 (라이브 ${live.rank}위)`;
  else verdict = '❌ 라이브에선 미노출 (순위 이탈 또는 파서 오탐)';
  console.log(
    `[${c.blogId}] "${c.keyword}" (${tabLabel[c.tab]})\n` +
    `    DB: ${c.dbRank}위  ↔  라이브: ${live.exposed ? live.rank + '위' : (live.error ? '오류' : '미노출')}   ${verdict}\n` +
    `    매칭경로: ${live.via ?? '-'}`
  );
  await sleep(800);
}
console.log('\n대조 완료');
