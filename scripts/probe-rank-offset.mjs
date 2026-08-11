// data-cr-on의 r= 값이 "페이지 상대순위(1~10)"인지 "전체 절대순위"인지 판별한다.
// 통합검색 3페이지를 훑어, 각 페이지에서 등장하는 blog.naver.com 항목의 (page, r=, DOM등장순번)을 나열.
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

const TARGET = { keyword: '노자', blogId: 'orangelibrary_', postId: '224358439190' };
const base = `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(TARGET.keyword)}`;

console.log(`=== "${TARGET.keyword}" data-cr-on r= 값 정체 판별 (target=${TARGET.blogId}/${TARGET.postId}) ===\n`);

for (let page = 1; page <= 3; page++) {
  const start = (page - 1) * 10 + 1;
  const url = page === 1 ? base : `${base}&start=${start}`;
  const res = await fetch(url, { headers: HEADERS });
  console.log(`--- page ${page} (start=${start}) status=${res.status} ---`);
  if (!res.ok) { await sleep(600); continue; }
  const html = await res.text();

  // data-cr-on r= 를 가진 blog.naver.com 항목을 DOM 등장 순서대로
  const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
  const seen = new Set();
  let mt, domIdx = 0;
  while ((mt = rankRegex.exec(html)) !== null) {
    const [, lb, lp, rs] = mt;
    const key = `${lb}/${lp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    domIdx++;
    const isTarget = lb.toLowerCase() === TARGET.blogId.toLowerCase() && lp === TARGET.postId;
    const computed = start + parseInt(rs) - 1;
    console.log(
      `  DOM#${String(domIdx).padStart(2)}  r=${String(rs).padStart(2)}  → start+r-1=${String(computed).padStart(2)}  ${lb}/${lp}${isTarget ? '   ★TARGET' : ''}`
    );
  }
  if (seen.size === 0) console.log('  (data-cr-on 항목 없음)');
  await sleep(700);
}
console.log('\n판별 기준: 같은 항목의 r= 값이 페이지가 넘어가도 이어지면(예: page2에서 11,12…) 절대순위, 매 페이지 1부터 다시 시작하면 상대순위');
