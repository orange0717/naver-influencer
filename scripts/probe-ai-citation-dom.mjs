/**
 * AI 브리핑 · AI 탭 실제 DOM 구조 조사용 일회성 프로브.
 * 판정 로직을 고치기 전에 "네이버 화면이 실제로 어떻게 생겼는지"를 확인한다.
 *
 *   node scripts/probe-ai-citation-dom.mjs "키워드"
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.LOCAL_CHROME_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const keyword = process.argv[2] || '강아지 슬개골 탈구';
const headless = process.env.HEADFUL !== '1';

const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({ executablePath: CHROME, headless, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 1366, height: 900 });

const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
log(`\n=== SEARCH PAGE ===\nkeyword="${keyword}"\nHTTP ${resp?.status()} ${resp?.url()}`);

const pageHealth = await page.evaluate(() => {
  const t = document.body.innerText || '';
  return {
    title: document.title,
    bodyLen: t.length,
    head: t.slice(0, 200),
    hasMainPack: !!document.querySelector('#main_pack'),
    hasSearchInput: !!document.querySelector('#nx_query, input[name="query"]'),
    hasTabBar: !!document.querySelector('.api_flicking_wrap, [role="tablist"], .sub_nav'),
    tabTexts: Array.from(document.querySelectorAll('.api_flicking_wrap a, [role="tablist"] a')).map(a => a.textContent.trim()).slice(0, 20),
  };
});
log(JSON.stringify(pageHealth, null, 2));

// 위젯이 늦게 뜨므로 대기
await page.waitForSelector('[class*="fds-aib"]', { timeout: 20000 }).then(() => log('fds-aib appeared')).catch(() => log('fds-aib NOT found in 20s'));
await new Promise(r => setTimeout(r, 3000));

const widget = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[class*="fds-aib"]'));
  const classes = {};
  for (const n of nodes) for (const c of n.classList) classes[c] = (classes[c] || 0) + 1;
  const top = nodes.find(n => !n.parentElement?.closest('[class*="fds-aib"]'));
  return {
    count: nodes.length,
    distinctClasses: Object.entries(classes).sort((a, b) => b[1] - a[1]).slice(0, 40),
    topOuterHTMLHead: top ? top.outerHTML.slice(0, 1500) : null,
    topText: top ? (top.innerText || '').slice(0, 600) : null,
    expandButtons: nodes.filter(n => (n.textContent || '').includes('펼쳐서 더보기')).map(n => n.tagName + '.' + n.className).slice(0, 5),
    blogLinksInWidget: Array.from(new Set(nodes.flatMap(n => Array.from(n.querySelectorAll('a[href*="blog.naver.com"]')).map(a => a.getAttribute('href'))))).slice(0, 20),
  };
});
log(`\n=== AI BRIEFING WIDGET ===\n${JSON.stringify(widget, null, 2)}`);

// 전체 문서의 블로그 링크(스코프 없이 긁을 때 얼마나 오염되는지)
const wholeDoc = await page.evaluate(() => ({
  allBlogLinks: Array.from(new Set(Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')).map(a => a.getAttribute('href')))).length,
}));
log(`전체 문서 blog.naver.com 링크 수: ${wholeDoc.allBlogLinks}`);

// ── AI 탭 ──
const aiTabHref = await page.evaluate(() =>
  (Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all')) || {}).href || null);
log(`\n=== AI TAB ===\nanchor: ${aiTabHref}`);

if (aiTabHref) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
    page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
      if (a) a.click();
    }),
  ]);
  log(`landed: ${page.url()}`);

  // 스트리밍 종료 대기
  const appeared = await page.waitForSelector('button[aria-label="중지"]', { timeout: 8000 }).then(() => true).catch(() => false);
  log(`stop button appeared: ${appeared}`);
  if (appeared) {
    const gone = await page.waitForSelector('button[aria-label="중지"]', { hidden: true, timeout: 60000 }).then(() => true).catch(() => false);
    log(`stop button disappeared: ${gone}`);
  }
  await new Promise(r => setTimeout(r, 4000));

  const tab = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const links = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]'));
    // 각 링크가 어떤 조상 컨테이너에 속하는지 — 스코프 후보를 찾기 위함
    const ancestry = links.slice(0, 30).map(a => {
      const chain = [];
      let el = a;
      for (let i = 0; i < 8 && el; i++) {
        chain.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`);
        el = el.parentElement;
      }
      return { href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 50), chain };
    });
    return {
      bodyLen: t.length,
      bodyHead: t.slice(0, 400),
      blogLinkCount: links.length,
      hasBriefingLabel: t.includes('AI 브리핑'),
      ancestry,
      candidateContainers: Array.from(document.querySelectorAll('[class*="source"],[class*="Source"],[class*="citation"],[class*="Citation"],[class*="reference"],[class*="ref_"],[class*="aitab"],[class*="ait_"]'))
        .map(n => n.tagName.toLowerCase() + '.' + (typeof n.className === 'string' ? n.className.trim().split(/\s+/).slice(0, 4).join('.') : ''))
        .slice(0, 40),
    };
  });
  log(JSON.stringify(tab, null, 2));
}

await browser.close();
