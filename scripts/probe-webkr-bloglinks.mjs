/**
 * 통합검색(where=webkr) HTML에서 블로그 포스트가 실제로 어떤 URL 형태로 실리는지 확인한다.
 *
 * 배경: checkViewTab 의 1차 매칭은 data-url="https://blog.naver.com/{id}/{logNo}" + data-cr-on="r=" 이다.
 * 그런데 통합검색 HTML에 이 형태가 하나도 없다면, 통합검색 노출은 사실상 늘 미발견으로 떨어지고
 * (실제로는 노출 중인데) 미노출로 굳는다. 링크가 리다이렉트 래퍼/인코딩 형태로 실리는지 실측한다.
 *
 * 사용: node scripts/probe-webkr-bloglinks.mjs [검색어]
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const keyword = process.argv[2] || '한국소설';
const url = `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
const res = await fetch(url, {
  headers: {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    Referer: 'https://search.naver.com/',
  },
});
const html = await res.text();
console.log(`status=${res.status} len=${html.length}`);

const probes = [
  ['blog.naver 문자열 전체', /blog\.naver/g],
  ['blog.naver.com/{id}/{logNo}', /blog\.naver\.com\/[a-zA-Z0-9_-]+\/\d+/g],
  ['blog.naver.com/{id} (글번호 없음)', /blog\.naver\.com\/[a-zA-Z0-9_-]+(?!\/\d)/g],
  ['URL 인코딩형(blog%2Enaver / %2F)', /blog(%2E|\.)naver(%2E|\.)com%2F/gi],
  ['data-cr-on="r=" 전체', /data-cr-on="r=\d+/g],
  ['data-url= 전체', /data-url="/g],
  ['cr.naver.com 리다이렉트', /cr\.naver\.com/g],
  ['search.naver.com/p/crd/rd', /\/p\/crd\/rd/g],
  ['PostView.naver?blogId=', /PostView\.n(aver|hn)\?blogId=/g],
  ['in.naver.com/contents', /in\.naver\.com\/[a-zA-Z0-9_.-]+\/contents/g],
  ['m.blog.naver.com', /m\.blog\.naver\.com/g],
];
for (const [label, re] of probes) {
  const n = (html.match(re) || []).length;
  console.log(`${String(n).padStart(5)}  ${label}`);
}

// data-url 속성에 실제로 어떤 값이 들어가는지 표본
const sample = [...html.matchAll(/data-url="([^"]{0,160})"/g)].slice(0, 8).map((m) => m[1]);
console.log('\ndata-url 표본:');
sample.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

// blog.naver 주변 컨텍스트 표본 (어떤 속성/래퍼에 실리는지)
const ctx = [...html.matchAll(/.{70}blog\.naver.{70}/g)].slice(0, 6).map((m) => m[0].replace(/\s+/g, ' '));
console.log('\nblog.naver 주변 컨텍스트 표본:');
ctx.forEach((s, i) => console.log(`  ${i + 1}. …${s}…`));
