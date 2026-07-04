// 네이버메이트 AI 브리핑 스크래핑 로컬 테스트 스크립트
// src/lib/naver-ai-briefing.ts의 로직을 그대로 복제(로컬 실행 전용, TS 빌드 없이 바로 node로 확인하기 위함).
// 실행: node scripts/test-ai-briefing.mjs "<키워드>" <blogId> <postId>
// 예:   node scripts/test-ai-briefing.mjs "부동산책추천" myblogid 223456789012
//
// blogId/postId는 확인하려는 내 포스팅의 blog.naver.com URL에서 가져오면 됨:
//   https://blog.naver.com/{blogId}/{postId}

import puppeteer from 'puppeteer-core';

const [, , keyword, blogId, postId] = process.argv;
if (!keyword || !blogId || !postId) {
  console.error('사용법: node scripts/test-ai-briefing.mjs "<키워드>" <blogId> <postId>');
  process.exit(1);
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;
const MAX_STREAM_WAIT_MS = 35_000;
const POLL_INTERVAL_MS = 1_000;
const STABLE_CHECKS_REQUIRED = 3;
const MIN_ANSWER_TEXT_LENGTH = 80;

const SOURCE_SELECTORS = [
  'a[href*="blog.naver.com"]',
  'a[href*="m.blog.naver.com"]',
  'a[href*="cafe.naver.com"]',
  'a[href*="post.naver.com"]',
];

function evaluateBriefing(sourceSelectors) {
  const seen = new Set();
  const sources = [];
  for (const sel of sourceSelectors) {
    document.querySelectorAll(sel).forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!href || seen.has(href)) return;
      seen.add(href);
      sources.push({ url: href, title: (link.textContent || '').trim() });
    });
  }
  return { answerTextLength: (document.body.innerText || '').length, sources };
}

function extractBlogPost(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)blog\.naver\.com$/i.test(u.hostname)) return null;
    const pathMatch = u.pathname.match(/^\/([a-zA-Z0-9_-]+)\/(\d+)\/?$/);
    if (pathMatch) return { blogId: pathMatch[1], postId: pathMatch[2] };
    if (/PostView\.naver/i.test(u.pathname)) {
      const bId = u.searchParams.get('blogId');
      const pId = u.searchParams.get('logNo');
      if (bId && pId) return { blogId: bId, postId: pId };
    }
    return null;
  } catch {
    return null;
  }
}

function findMatch(sources, blogId, postId) {
  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId);
  for (let i = 0; i < sources.length; i++) {
    const parsed = extractBlogPost(sources[i].url);
    if (parsed && parsed.blogId.toLowerCase() === blogIdLower && parsed.postId === postIdStr) {
      return { index: i + 1, source: sources[i] };
    }
  }
  return null;
}

async function waitForStreamStable(page) {
  let lastLength = -1;
  let stableCount = 0;
  const start = Date.now();
  while (Date.now() - start < MAX_STREAM_WAIT_MS) {
    const length = await page.evaluate(() => (document.body?.innerText || '').length).catch(() => 0);
    if (length > 0 && length === lastLength) {
      stableCount++;
      if (stableCount >= STABLE_CHECKS_REQUIRED) return;
    } else {
      stableCount = 0;
    }
    lastLength = length;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function enterAiTab(page, keyword) {
  const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  console.log(`[정보] 일반 검색 진입: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

  const hasAiTabLink = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all'));
  });
  if (!hasAiTabLink) {
    console.log('[정보] 이 키워드는 AI 탭 링크 자체가 없음');
    return false;
  }

  console.log('[정보] AI 탭 앵커 클릭...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null),
    page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
      if (a) a.click();
    }),
  ]);

  const landed = page.url();
  console.log(`[정보] 도착 URL: ${landed}`);
  return landed.includes('ssc=tab.ait.all');
}

async function main() {
  const localPath = process.env.LOCAL_CHROME_EXECUTABLE_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  console.log(`[정보] Chrome 실행 경로: ${localPath}`);

  const browser = await puppeteer.launch({ executablePath: localPath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });

    const entered = await enterAiTab(page, keyword);
    if (!entered) {
      console.log('\n[결과] hasAiBriefing: false (AI 탭 진입 실패 또는 미제공)');
      return;
    }

    console.log('[정보] 답변 스트리밍 안정화 대기 중(최대 35초)...');
    const waitStart = Date.now();
    await waitForStreamStable(page);
    console.log(`[정보] 대기 종료 — 경과 ${Date.now() - waitStart}ms`);

    const result = await page.evaluate(evaluateBriefing, SOURCE_SELECTORS);

    console.log(`[정보] 답변 텍스트 길이: ${result.answerTextLength}자 (임계값 ${MIN_ANSWER_TEXT_LENGTH}자)`);
    console.log(`[정보] 수집된 링크 ${result.sources.length}개:`);
    result.sources.forEach((s, i) => console.log(`  #${i + 1} ${s.title || '(제목없음)'} — ${s.url}`));

    if (result.answerTextLength < MIN_ANSWER_TEXT_LENGTH) {
      console.log('\n[결과] hasAiBriefing: false (답변 텍스트가 임계값보다 짧음)');
      return;
    }

    const match = findMatch(result.sources, blogId, postId);
    console.log('\n[최종 결과]');
    console.log(JSON.stringify({
      hasAiBriefing: true,
      exposed: !!match,
      sourceIndex: match?.index ?? null,
      sourceTotal: result.sources.length || null,
      matchedTitle: match?.source.title || null,
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(e => {
  console.error('[오류]', e);
  process.exit(1);
});
