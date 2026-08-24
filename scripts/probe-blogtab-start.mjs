/**
 * 블로그탭(ssc=tab.blog.all)이 &start= 파라미터를 실제로 반영하는지 확인한다.
 *
 * 통합검색(where=webkr)·인플루언서탭은 start를 무시하고 항상 1페이지를 돌려준다는 게
 * probe-rank-offset.mjs / probe-influencer-tab.mjs 로 확증돼 있는데, checkBlogTab 만
 * 아직 page 1~3 루프 + start 오프셋 가산을 유지하고 있다. 만약 블로그탭도 start를 무시하면
 * 같은 결과를 3번 받아 (a) 순위를 +10/+20 부풀리고 (b) 확인하지도 않은 30위까지
 * "확인 범위"로 표시하게 된다.
 *
 * 사용: node scripts/probe-blogtab-start.mjs [검색어]
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const query = process.argv[2] || '한국소설';
const base = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: 'https://search.naver.com/',
    },
  });
  const html = await res.text();

  const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
  const items = [];
  const seen = new Set();
  let m;
  while ((m = rankRegex.exec(html)) !== null) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ key, r: Number(m[3]) });
  }

  // data-cr-on 없는 항목까지 포함한 전체 블로그 링크 수(폴백 경로가 보는 개수)
  const hrefRegex = /blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/g;
  const hrefSeen = new Set();
  while ((m = hrefRegex.exec(html)) !== null) hrefSeen.add(`${m[1]}/${m[2]}`);

  return {
    ok: res.ok,
    len: html.length,
    container: /id=["']main_pack["']/.test(html),
    items,
    hrefCount: hrefSeen.size,
  };
}

const pages = [];
for (const [label, url] of [
  ['page1', base],
  ['page2(start=11)', `${base}&start=11`],
  ['page3(start=21)', `${base}&start=21`],
]) {
  const p = await fetchPage(url);
  pages.push([label, p]);
  const range = p.items.length ? `${p.items[0].r}~${p.items[p.items.length - 1].r}` : '-';
  console.log(
    `${label}: ok=${p.ok} container=${p.container} len=${p.len} data-cr-on항목=${p.items.length} (r=${range}) href총개수=${p.hrefCount}`,
  );
  console.log('   상위3:', p.items.slice(0, 3).map((x) => `${x.key}@r=${x.r}`).join(' | ') || '(없음)');
  await new Promise((r) => setTimeout(r, 800));
}

const s1 = new Set(pages[0][1].items.map((x) => x.key));
const s2 = new Set(pages[1][1].items.map((x) => x.key));
const overlap = [...s2].filter((k) => s1.has(k)).length;
console.log(
  `\np1∩p2 겹침: ${overlap}/${s2.size} → ${
    s2.size > 0 && overlap === s2.size ? '★ start= 무시됨 (같은 페이지를 3번 받는 중)' : '페이지네이션 정상 동작'
  }`,
);
