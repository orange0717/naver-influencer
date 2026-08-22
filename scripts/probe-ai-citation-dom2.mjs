/**
 * 2차 프로브 — (a) 통합검색 AI 브리핑 위젯의 "현재" 마크업, (b) AI 탭 출처 목록 전체 열거.
 *   node scripts/probe-ai-citation-dom2.mjs "키워드"
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.LOCAL_CHROME_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const keyword = process.argv[2] || '강아지 슬개골 탈구';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: process.env.HEADFUL !== '1', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 1366, height: 900 });

await page.goto(`https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

// fds-aib 노드가 잠깐 나타났다 사라지는지 추적
const aibTrace = [];
for (let i = 0; i < 12; i++) {
  const n = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[class*="fds-aib"]'));
    return { count: nodes.length, cls: nodes.slice(0, 3).map(x => x.className).join(' | ') };
  });
  aibTrace.push(`${i * 500}ms count=${n.count} ${n.cls.slice(0, 120)}`);
  await sleep(500);
}
log('=== fds-aib 시간추적 ===\n' + aibTrace.join('\n'));

const searchScan = await page.evaluate(() => {
  const body = document.body.innerText || '';
  const tokens = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (typeof el.className !== 'string') return;
    el.className.split(/\s+/).forEach(c => {
      if (/^(fds|sds|api|ai)[-_]/i.test(c) && /ai/i.test(c)) tokens.add(c);
    });
  });
  // "AI 브리핑" 문구를 포함하는 최소 컨테이너 찾기
  let briefingHost = null;
  const all = Array.from(document.querySelectorAll('div,section'));
  for (const el of all) {
    if ((el.textContent || '').includes('AI 브리핑') && el.children.length) {
      briefingHost = el;
    }
  }
  return {
    bodyHasBriefingLabel: body.includes('AI 브리핑'),
    bodyHasAiAnswerish: body.includes('AI가 생성') || body.includes('AI 요약'),
    aiClassTokens: Array.from(tokens).slice(0, 60),
    briefingHostClass: briefingHost ? briefingHost.className : null,
    briefingHostText: briefingHost ? (briefingHost.innerText || '').slice(0, 300) : null,
    topLevelSections: Array.from(document.querySelectorAll('#main_pack > section, #main_pack > div')).map(s => ({
      cls: typeof s.className === 'string' ? s.className.slice(0, 80) : '',
      head: (s.innerText || '').trim().slice(0, 60).replace(/\n/g, ' | '),
    })).slice(0, 25),
  };
});
log('\n=== 통합검색 AI 관련 스캔 ===\n' + JSON.stringify(searchScan, null, 2));

// ── AI 탭 진입 후 출처 전수 조사 ──
const hasTab = await page.evaluate(() => {
  const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
  if (a) { a.click(); return true; }
  return false;
});
if (!hasTab) { log('AI 탭 앵커 없음'); await browser.close(); process.exit(0); }

await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
await page.waitForSelector('button[aria-label="중지"]', { timeout: 8000 }).catch(() => null);
await page.waitForSelector('button[aria-label="중지"]', { hidden: true, timeout: 60000 }).catch(() => null);
await sleep(3000);

const before = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map(a => a.getAttribute('href')).filter(h => /naver\.com/.test(h));
  return {
    allNaverLinks: Array.from(new Set(links)).slice(0, 40),
    overlayItems: document.querySelectorAll('[class*="fds-source-overlay"]').length,
    conversationItems: document.querySelectorAll('[class*="fds-ai-tab-conversation-item"]').length,
    // "+N" 더보기 / 출처 버튼 후보
    clickables: Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .map(b => ({ tag: b.tagName, cls: (typeof b.className === 'string' ? b.className : '').slice(0, 70), text: (b.textContent || '').trim().slice(0, 30), aria: b.getAttribute('aria-label') }))
      .filter(x => x.text || x.aria).slice(0, 60),
  };
});
log('\n=== AI 탭: 출처 열기 전 ===\n' + JSON.stringify(before, null, 2));

// "+N" 배지(출처 더보기) 클릭 시도
const opened = await page.evaluate(() => {
  const cand = Array.from(document.querySelectorAll('button,a,[role="button"],span'))
    .find(el => /^\+\d+$/.test((el.textContent || '').trim()));
  if (cand) { (cand.closest('button,a,[role="button"]') || cand).click(); return (cand.textContent || '').trim(); }
  return null;
});
log(`\n"+N" 클릭: ${opened}`);
await sleep(2500);

const after = await page.evaluate(() => {
  const inOverlay = Array.from(document.querySelectorAll('[class*="fds-source-overlay"] a[href]')).map(a => ({
    href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 60),
  }));
  const inConversation = Array.from(document.querySelectorAll('[class*="fds-ai-tab-conversation-item"] a[href]')).map(a => ({
    href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 60),
  }));
  return {
    overlayNodes: document.querySelectorAll('[class*="fds-source-overlay"]').length,
    overlayLinks: inOverlay,
    conversationLinkCount: inConversation.length,
    conversationLinks: inConversation.slice(0, 30),
    allNaverLinks: Array.from(new Set(Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(h => /naver\.com/.test(h)))).slice(0, 40),
  };
});
log('\n=== AI 탭: 출처 열기 후 ===\n' + JSON.stringify(after, null, 2));

await browser.close();
