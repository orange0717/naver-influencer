/**
 * 독립 관측용 프로브 — 엔진 판정 로직을 전혀 쓰지 않고, 네이버 AI 브리핑/AI 탭 화면에
 * **실제로 걸려 있는 출처 링크 원본**을 그대로 덤프한다.
 * 엔진이 낸 CITED/NOT_CITED 가 화면과 맞는지 사람이 눈으로 대조하기 위한 "정답지"다(스펙 #18).
 *
 *   node scripts/probe-ai-citation-sources.mjs "키워드1" "키워드2" ...
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.LOCAL_CHROME_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const keywords = process.argv.slice(2);
if (keywords.length === 0) {
  console.error('사용법: node scripts/probe-ai-citation-sources.mjs "키워드" ...');
  process.exit(1);
}

/** 스코프 안의 blog.naver.com 링크를 있는 그대로 긁는다(판정 없음). */
const dumpSources = (scope) => {
  const nodes = Array.from(document.querySelectorAll(scope));
  const out = [];
  const seen = new Set();
  for (const n of nodes) {
    n.querySelectorAll('a[href^="http"]').forEach(a => {
      const href = a.getAttribute('href');
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ href, text: (a.textContent || '').trim().slice(0, 60) });
    });
  }
  return { nodeCount: nodes.length, textLen: nodes.reduce((s, n) => s + (n.innerText || '').length, 0), links: out };
};

/** "+N" 칩을 눌러 접힌 출처를 DOM 에 싣는다. */
const clickPlusChip = (scope) => {
  for (const root of document.querySelectorAll(scope)) {
    const chip = Array.from(root.querySelectorAll('button,a,[role="button"],span'))
      .find(el => /^\+\d+$/.test((el.textContent || '').trim()));
    if (chip) { (chip.closest('button,a,[role="button"]') || chip).click(); return true; }
  }
  return false;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

for (const kw of keywords) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1366, height: 900 });
  console.log(`\n${'='.repeat(78)}\n키워드: ${kw}`);

  try {
    await page.goto(`https://search.naver.com/search.naver?query=${encodeURIComponent(kw)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(8000); // 위젯 비동기 렌더 대기

    const body = await page.evaluate(() => document.body.innerText || '');
    if (/잘못된 접근입니다|자동입력 방지|보안문자/.test(body)) {
      console.log('  ⚠️ 네이버 차단/캡차 화면 — 관측 불가');
      await page.close();
      continue;
    }

    // ── AI 브리핑 ──
    await page.evaluate(clickPlusChip, '[class*="fds-aib-multi-source"]').catch(() => {});
    await sleep(1200);
    const brief = await page.evaluate(dumpSources, '[class*="fds-aib"]');
    console.log(`\n[AI 브리핑] 노드=${brief.nodeCount} 본문길이=${brief.textLen} 링크=${brief.links.length}`);
    brief.links.forEach((l, i) => console.log(`  ${i + 1}. ${l.href}\n      "${l.text}"`));
    if (brief.nodeCount === 0) console.log('  (위젯 없음)');

    // ── AI 탭 ──
    const hasTab = await page.evaluate(() =>
      !!Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all')));
    if (!hasTab) {
      console.log('\n[AI 탭] 앵커 없음 — 이 키워드엔 AI 탭 미제공');
      await page.close();
      continue;
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
      page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
        if (a) a.click();
      }),
    ]);

    // 답변 생성이 끝날 때까지(중지 버튼 소멸) 기다린다.
    await page.waitForSelector('button[aria-label="중지"]', { timeout: 10000 }).catch(() => null);
    await page.waitForSelector('button[aria-label="중지"]', { hidden: true, timeout: 60000 }).catch(() => null);
    await sleep(2000);

    const before = await page.evaluate(dumpSources, '[class*="fds-ai-tab-conversation-item"]');
    const clicked = await page.evaluate(clickPlusChip, '[class*="fds-ai-tab-conversation-item"]').catch(() => false);
    await sleep(1500);
    const after = await page.evaluate(dumpSources, '[class*="fds-ai-tab-conversation-item"]');

    console.log(`\n[AI 탭] 노드=${after.nodeCount} 본문길이=${after.textLen} `
      + `링크=${before.links.length} → ${after.links.length} ("+N" 칩 클릭: ${clicked ? 'O' : 'X'})`);
    after.links.forEach((l, i) => console.log(`  ${i + 1}. ${l.href}\n      "${l.text}"`));
    if (after.nodeCount === 0) console.log('  (AI 탭 답변 영역 없음)');
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
  await page.close();
  await sleep(9000); // 네이버 부하 배려
}

await browser.close();
