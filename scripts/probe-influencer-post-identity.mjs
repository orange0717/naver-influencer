/**
 * 인플루언서 콘텐츠(in.naver.com/{handle}/contents/internal/{id})를 "글 단위"로 식별할 수 있는지 확인한다.
 *
 * 배경: matchInfluencerContentByHandle 은 handle 만 보고 매칭한다. 즉 같은 인플루언서의 *다른* 글이
 * 검색결과에 있어도 "내가 검사 중인 이 글이 노출됐다"고 판정해버린다(오탐). 글 단위로 구분할 근거가
 * HTML 안에 있는지(제목 텍스트 / blog logNo 동반 노출 등) 실측한다.
 *
 * 사용: node scripts/probe-influencer-post-identity.mjs [검색어] [handle]
 */
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://search.naver.com/',
};

const keyword = process.argv[2] || '한국소설';
const targetHandle = (process.argv[3] || '').toLowerCase();

for (const [label, url] of [
  ['인플루언서탭', `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`],
  ['통합검색(webkr)', `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(keyword)}`],
]) {
  const res = await fetch(url, { headers: HEADERS });
  const html = await res.text();
  console.log(`\n===== ${label} "${keyword}" status=${res.status} len=${html.length} =====`);

  const $ = cheerio.load(html);

  // in.naver.com 콘텐츠 링크를 앵커 단위로 수집 → 그 앵커/조상에서 제목 텍스트를 얻을 수 있는가?
  const entries = [];
  const seen = new Set();
  $('a[href*="in.naver.com"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/in\.naver\.com\/([a-zA-Z0-9_.-]+)\/contents\/internal\/(\d+)/);
    if (!m) return;
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ownText = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    const parentText = ($(el).parent().text() || '').replace(/\s+/g, ' ').trim();
    entries.push({ handle: m[1], contentId: m[2], ownText, parentText });
  });

  console.log(`in.naver 콘텐츠 앵커: ${entries.length}개`);
  entries.slice(0, 12).forEach((e, i) => {
    console.log(
      `  #${i + 1} handle=${e.handle} id=${e.contentId} title="${(e.ownText || e.parentText).slice(0, 60)}"`,
    );
  });

  // 같은 handle이 여러 글로 중복 등장하는가? → 등장하면 handle 매칭은 글 단위 판정 불가의 증거
  const byHandle = new Map();
  for (const e of entries) byHandle.set(e.handle.toLowerCase(), (byHandle.get(e.handle.toLowerCase()) || 0) + 1);
  const multi = [...byHandle.entries()].filter(([, n]) => n > 1);
  console.log(
    `동일 handle이 2건 이상 노출: ${multi.length ? multi.map(([h, n]) => `${h}×${n}`).join(', ') : '없음'}`,
  );

  // in.naver 콘텐츠 옆에 blog logNo 가 같이 실리는가? (실리면 글 단위 정밀 매칭 가능)
  const logNos = new Set();
  const re = /blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) logNos.add(`${m[1]}/${m[2]}`);
  console.log(`blog.naver.com/{id}/{logNo} 동반 노출: ${logNos.size}건`);
  if (logNos.size) console.log(`  예: ${[...logNos].slice(0, 5).join(', ')}`);

  if (targetHandle) {
    const hits = entries.filter((e) => e.handle.toLowerCase() === targetHandle);
    console.log(`target handle "${targetHandle}" 매칭: ${hits.length}건 ${hits.map((h) => h.contentId).join(',')}`);
  }
  await new Promise((r) => setTimeout(r, 900));
}
