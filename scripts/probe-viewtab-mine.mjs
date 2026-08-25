/**
 * 통합검색에서 "내 글"이 실제로 잡히는지 실측한다.
 *
 * 배경(2026-08-25): 프로덕션 실데이터에서 블로그탭 1위인 글이 통합검색은 '미노출'로 저장돼 있었다.
 * 통합검색은 블로그탭 결과를 끌어오므로 이 조합은 사실상 불가능 → 판정이 틀렸다는 뜻이다.
 * checkViewTab 의 1차 매칭(data-url + data-cr-on)과 같은 방식으로 훑어 무엇이 어긋나는지 본다.
 *
 * 사용: node scripts/probe-viewtab-mine.mjs "검색어" <blogId> <postId>
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const [keyword, blogId, postId] = process.argv.slice(2);
if (!keyword || !blogId) {
  console.error('사용: node scripts/probe-viewtab-mine.mjs "검색어" <blogId> [postId]');
  process.exit(1);
}

for (const where of ['webkr', 'nexearch']) {
  const url = `https://search.naver.com/search.naver?where=${where}&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: 'https://search.naver.com/',
    },
  });
  const html = await res.text();
  console.log(`\n=== where=${where} status=${res.status} len=${html.length} ===`);

  // 이 페이지에 실린 모든 블로그 포스트(중복 제거, 등장 순서 유지)
  const posts = [];
  const seen = new Set();
  for (const m of html.matchAll(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/g)) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push({ blogId: m[1], postId: m[2] });
  }
  console.log(`블로그 포스트 링크 ${posts.length}건(중복 제거)`);

  const mineAny = posts.filter(p => p.blogId.toLowerCase() === blogId.toLowerCase());
  console.log(`내 블로그(${blogId}) 글: ${mineAny.length}건 → ${mineAny.map(p => p.postId).join(', ') || '없음'}`);

  if (postId) {
    const idx = posts.findIndex(p => p.blogId.toLowerCase() === blogId.toLowerCase() && p.postId === postId);
    console.log(`검사 대상 ${postId}: ${idx >= 0 ? `발견 (등장순서 ${idx + 1}번째)` : '이 페이지에 없음'}`);
  }

  // checkViewTab 1차 매칭과 같은 형태: data-url + data-cr-on="r="
  const crOn = [...html.matchAll(/data-cr-on="[^"]*\br=(\d+)/g)].map(m => Number(m[1]));
  console.log(`data-cr-on 순위값 ${crOn.length}건: ${crOn.slice(0, 20).join(',')}`);

  // 내 글 주변에 순위 속성이 실려 있는지
  if (postId) {
    const at = html.indexOf(`${blogId}/${postId}`);
    if (at >= 0) {
      const around = html.slice(Math.max(0, at - 700), at + 200);
      const r = around.match(/data-cr-on="[^"]*\br=(\d+)/);
      console.log(`내 글 앞 700자 내 data-cr-on: ${r ? `r=${r[1]}` : '없음 (→ 순위 못 읽음)'}`);
      const du = around.includes('data-url=');
      console.log(`내 글 앞 700자 내 data-url=: ${du ? '있음' : '없음'}`);
    }
  }
}
