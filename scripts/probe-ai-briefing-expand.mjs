/**
 * 4차 프로브 — AI 브리핑 위젯의 출처를 "전부" 열거하려면 어떤 조작이 필요한지 확인.
 * 현재 코드는 '펼쳐서 더보기' 텍스트를 포함하는 fds-aib 노드를 클릭하는데,
 * textContent 는 자손을 포함하므로 실제 버튼이 아니라 최상위 컨테이너를 클릭할 위험이 있다.
 *   node scripts/probe-ai-briefing-expand.mjs "키워드"
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.LOCAL_CHROME_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kw = process.argv[2] || '종합소득세 신고 방법';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 1366, height: 900 });
await page.goto(`https://search.naver.com/search.naver?query=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(6000);

const snap = label => page.evaluate(l => {
  const nodes = Array.from(document.querySelectorAll('[class*="fds-aib"]'));
  const links = Array.from(new Set(nodes.flatMap(n =>
    Array.from(n.querySelectorAll('a[href]')).map(a => a.getAttribute('href')))));
  return {
    label: l,
    aibNodes: nodes.length,
    allLinks: links.length,
    blogLinks: links.filter(h => /blog\.naver\.com/.test(h)),
    otherLinks: links.filter(h => !/blog\.naver\.com/.test(h)).slice(0, 12),
    scrollAreaLinks: Array.from(document.querySelectorAll('[class*="fds-aib-multi-source"] a[href]')).length,
    textLen: nodes.reduce((s, n) => s + (n.textContent || '').length, 0),
  };
}, label);

console.log(`\n[키워드] ${kw}`);
console.log(JSON.stringify(await snap('0. 초기'), null, 2));

// 현재 프로덕션 코드와 동일한 방식(=컨테이너 클릭 위험)
const prodClick = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[class*="fds-aib"]'));
  const btn = nodes.find(el => (el.textContent || '').includes('펼쳐서 더보기'));
  if (!btn) return null;
  return { tag: btn.tagName, cls: btn.className.slice(0, 120), isButton: btn.tagName === 'BUTTON', textLen: (btn.textContent || '').length };
});
console.log('\n현재 코드가 클릭하게 되는 노드:', JSON.stringify(prodClick, null, 2));

// 진짜 버튼 찾기
const realBtn = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('button,[role="button"],a'));
  const b = els.find(e => (e.textContent || '').trim() === '펼쳐서 더보기'
    || ((e.textContent || '').includes('펼쳐서 더보기') && (e.textContent || '').length < 40));
  if (!b) return null;
  b.click();
  return { tag: b.tagName, cls: (typeof b.className === 'string' ? b.className : '').slice(0, 120), text: (b.textContent || '').trim() };
});
console.log('\n진짜 펼침 버튼:', JSON.stringify(realBtn, null, 2));
await sleep(2500);
console.log(JSON.stringify(await snap('1. 펼쳐서 더보기 클릭 후'), null, 2));

// "+N" 출처 칩 클릭
const plusChip = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[class*="fds-aib"] *'));
  const c = els.find(e => /^\+\d+$/.test((e.textContent || '').trim()));
  if (!c) return null;
  const target = c.closest('button,a,[role="button"]') || c;
  target.click();
  return { text: (c.textContent || '').trim(), tag: target.tagName, cls: (typeof target.className === 'string' ? target.className : '').slice(0, 120) };
});
console.log('\n"+N" 칩:', JSON.stringify(plusChip, null, 2));
await sleep(2500);
console.log(JSON.stringify(await snap('2. +N 클릭 후'), null, 2));

// 출처 전체보기 류 버튼
const allSrc = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('button,[role="button"],a,span'));
  const c = els.find(e => /출처.*전체|전체보기|출처 \d+건/.test((e.textContent || '').trim()) && (e.textContent || '').length < 30);
  if (!c) return null;
  (c.closest('button,a,[role="button"]') || c).click();
  return (c.textContent || '').trim();
});
console.log('\n출처 전체보기 버튼:', allSrc);
await sleep(2500);
console.log(JSON.stringify(await snap('3. 출처 전체보기 후'), null, 2));

// 문서 전체 오버레이(위젯 밖으로 렌더될 수 있음)
const overlay = await page.evaluate(() => {
  const sel = '[class*="source-overlay"],[class*="fds-source"],[role="dialog"]';
  const nodes = Array.from(document.querySelectorAll(sel));
  return {
    nodeCount: nodes.length,
    links: Array.from(new Set(nodes.flatMap(n => Array.from(n.querySelectorAll('a[href]')).map(a => a.getAttribute('href'))))).slice(0, 30),
  };
});
console.log('\n오버레이(문서 전체):', JSON.stringify(overlay, null, 2));

await browser.close();
