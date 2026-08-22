/**
 * 3차 프로브 — 여러 키워드에 대해 통합검색 인라인 "AI 브리핑" 위젯이 실제로 뜨는지 확인.
 * 현재 코드의 판정 셀렉터([class*="fds-aib"])가 아직 유효한지 검증하는 것이 목적.
 *   node scripts/probe-ai-briefing-widget.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.LOCAL_CHROME_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const keywords = process.argv.slice(2).length ? process.argv.slice(2) : [
  '강아지 슬개골 탈구',
  '전세 계약 갱신청구권',
  '커피 하루 몇 잔',
  '제주도 3박4일 코스',
  '종합소득세 신고 방법',
  '단백질 하루 권장량',
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

for (const kw of keywords) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1366, height: 900 });
  try {
    const resp = await page.goto(`https://search.naver.com/search.naver?query=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6000); // 위젯 비동기 렌더 대기

    const r = await page.evaluate(() => {
      const body = document.body.innerText || '';
      const aib = Array.from(document.querySelectorAll('[class*="fds-aib"]'));
      const persistent = aib.filter(n => (n.innerText || '').trim().length > 50);
      return {
        blocked: body.includes('잘못된 접근입니다'),
        bodyLen: body.length,
        hasBriefingLabel: body.includes('AI 브리핑'),
        aibNodes: aib.length,
        aibClasses: Array.from(new Set(aib.flatMap(n => Array.from(n.classList)))).filter(c => c.includes('aib')),
        aibTextLen: aib.reduce((s, n) => s + (n.textContent || '').length, 0),
        persistentCount: persistent.length,
        persistentSample: persistent[0] ? (persistent[0].innerText || '').slice(0, 200) : null,
        aibBlogLinks: Array.from(new Set(aib.flatMap(n => Array.from(n.querySelectorAll('a[href*="blog.naver.com"]')).map(a => a.getAttribute('href'))))).length,
        hasExpand: body.includes('펼쳐서 더보기'),
      };
    });
    console.log(`\n[${kw}] HTTP ${resp?.status()}\n` + JSON.stringify(r, null, 2));
  } catch (e) {
    console.log(`\n[${kw}] ERROR ${e.message}`);
  }
  await page.close();
  await sleep(4000);
}

await browser.close();
