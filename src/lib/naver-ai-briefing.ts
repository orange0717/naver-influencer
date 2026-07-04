import puppeteer, { type Browser, type Page } from 'puppeteer-core';

/**
 * 네이버 "AI" 탭(생성형 검색 답변) 노출 여부 확인 — 네이버메이트 기능의 핵심 엔진.
 *
 * ⚠️ 2026-07-04 구조 수정: 오렌지가 제공한 실제 스크린샷 + URL로 확인한 결과,
 * AI 답변은 통합검색 결과에 끼워진 박스가 아니라 검색 후 별도 클릭해 들어가는
 * **전용 "AI" 탭**(`ssc=tab.ait.all`)이며, 챗봇처럼 답변이 스트리밍되고 인용은
 * 문단 안에 인라인 칩(클릭 시 해당 블로그로 이동하는 실제 링크)으로 박힌다.
 * "출처 전체보기" 확장형 리스트가 아니므로 컨테이너를 문서 전체로 보고 텍스트
 * 안정화를 기다린 뒤 blog.naver.com 링크를 그대로 수집한다.
 * ⚠️ Chrome 자동화 도구가 search.naver.com 자체를 접근 차단하고 있어 실제 DOM을
 * 직접 열어 검증하지 못했다 — 아래 셀렉터/휴리스틱은 오렌지 확인 답변 기반 추정치이며,
 * 로컬 puppeteer 실행 결과로 추후 보정 필요.
 * 참고: /Users/orange/개발/naver-ai-briefing-tracker (Playwright 기반 로컬 프로토타입)의
 * 매칭 로직(blogId+postId 파싱)은 그대로 유지.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;

// AI 탭은 챗봇처럼 답변이 스트리밍되므로 고정 대기 대신 텍스트가 안정될 때까지 폴링
const MAX_STREAM_WAIT_MS = 20_000;
const POLL_INTERVAL_MS = 800;
const STABLE_CHECKS_REQUIRED = 2; // 연속으로 텍스트가 안 바뀌면 스트리밍 종료로 간주
const MIN_ANSWER_TEXT_LENGTH = 80; // 이 이하면 답변 미생성(hasAiBriefing=false)으로 간주

// 네이버 DOM은 자주 바뀌므로 다중 셀렉터 + 헤딩 텍스트 fallback, 최종적으로 body 전체
const CONTAINER_SELECTORS = [
  'div[class*="ai_briefing" i]',
  'section[class*="ai_briefing" i]',
  'div[class*="AiBriefing"]',
  'div[id*="ai_briefing" i]',
  'div.sc_new._ai_briefing',
  'div[class*="ait_" i]',
  'div[class*="answer" i]',
  'main',
];

const SOURCE_SELECTORS = [
  'a[href*="blog.naver.com"]',
  'a[href*="m.blog.naver.com"]',
  'a[href*="cafe.naver.com"]',
  'a[href*="post.naver.com"]',
  'a[class*="source" i]',
  'a[class*="citation" i]',
  'a[class*="chip" i]',
  'li[class*="source" i] a',
  'div[class*="source" i] a',
];

// 일부 화면엔 여전히 "출처 더보기" 류 확장 버튼이 남아있을 수 있어 방어적으로 유지
const EXPAND_TEXTS = ['출처', '전체보기', '더보기', '참고 링크'];
const EXPAND_WAIT_MS = 700;

interface RawSource {
  url: string;
  title: string;
  author: string;
}

interface BriefingEvalResult {
  answerTextLength: number;
  sources: RawSource[];
}

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean;      // 이 키워드 검색 시 AI 탭 답변 자체가 생성되는지
  exposed: boolean;            // 답변 인용 출처 중 내 포스팅이 포함되는지
  sourceIndex: number | null;  // 출처 순번 (1부터)
  sourceTotal: number | null;  // 출처 총 개수
  matchedTitle: string | null; // 매칭된 출처 표시 제목
  error?: string;
}

/** 브라우저 컨텍스트 안에서 실행 — 답변 컨테이너 탐색 + 출처 링크 수집 */
async function evaluateBriefing(args: {
  containerSelectors: string[];
  sourceSelectors: string[];
  expandTexts: string[];
  expandWaitMs: number;
}): Promise<BriefingEvalResult> {
  const { containerSelectors, sourceSelectors, expandTexts, expandWaitMs } = args;

  function findContainer(): Element {
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const headings = Array.from(document.querySelectorAll('h2, h3, strong'));
    const heading = headings.find(h => (h.textContent || '').includes('AI'));
    if (heading) {
      const closest = heading.closest('section') || heading.closest('div.sc_new') || heading.parentElement;
      if (closest) return closest;
    }
    return document.body;
  }

  const container = findContainer();

  // 남아있을 수 있는 "출처 더보기" 류 버튼 확장 시도 (방어적)
  const clickable = Array.from(container.querySelectorAll('a, button, span'));
  for (const text of expandTexts) {
    const btn = clickable.find(el => {
      const t = (el.textContent || '').trim();
      return t === text || t.includes(text);
    });
    if (btn) {
      try { (btn as unknown as HTMLElement).click(); } catch { /* 클릭 불가 요소는 무시 */ }
    }
  }
  if (expandWaitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, expandWaitMs));
  }

  const seen = new Set<string>();
  const sources: RawSource[] = [];
  for (const sel of sourceSelectors) {
    const links = container.querySelectorAll(sel);
    links.forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!href || seen.has(href)) return;
      seen.add(href);
      const title = (link.textContent || '').trim();
      let author = '';
      const parent = link.closest('li, article, div');
      if (parent) {
        const cand = parent.querySelector('[class*="name" i], [class*="author" i], [class*="blog" i], [class*="nick" i]');
        if (cand) author = (cand.textContent || '').trim();
      }
      sources.push({ url: href, title, author });
    });
  }

  const answerText = (container.textContent || '').trim();
  return { answerTextLength: answerText.length, sources };
}

/** 스트리밍 답변 텍스트가 안정될 때까지 폴링 (고정 대기 대신) */
async function waitForStreamStable(page: Page): Promise<void> {
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

/** 네이버 블로그 URL(경로형/쿼리형 모두)에서 {blogId, postId} 추출 */
function extractBlogPost(url: string): { blogId: string; postId: string } | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)blog\.naver\.com$/i.test(u.hostname)) return null;

    const pathMatch = u.pathname.match(/^\/([a-zA-Z0-9_-]+)\/(\d+)\/?$/);
    if (pathMatch) return { blogId: pathMatch[1], postId: pathMatch[2] };

    if (/PostView\.naver/i.test(u.pathname)) {
      const blogId = u.searchParams.get('blogId');
      const postId = u.searchParams.get('logNo');
      if (blogId && postId) return { blogId, postId };
    }
    return null;
  } catch {
    return null;
  }
}

function findMatch(sources: RawSource[], blogId: string, postId: string): { index: number; source: RawSource } | null {
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

/**
 * Vercel(서버리스)에서는 @sparticuz/chromium 바이너리를, 로컬 개발에서는 시스템 Chrome을 사용한다.
 * 로컬 Chrome 경로가 다르면 LOCAL_CHROME_EXECUTABLE_PATH 환경변수로 지정.
 */
async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const localPath = process.env.LOCAL_CHROME_EXECUTABLE_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return puppeteer.launch({ executablePath: localPath, headless: true });
}

/**
 * keyword로 네이버 "AI" 탭에 진입 → 답변 생성 여부 + (생성 시) 내 포스팅의 인용 인덱스를 확인한다.
 * 브라우저 1회 실행당 호출 1건 — 배치로 여러 키워드를 확인할 때는 launchBrowser를 한 번만 열고
 * page만 새로 만들어 재사용하는 것이 비용 효율적이다 (checkAiBriefingBatch 참고).
 */
export async function checkAiBriefingExposure(
  keyword: string,
  blogId: string,
  postId: string,
): Promise<AiBriefingCheckResult> {
  const browser = await launchBrowser();
  try {
    return await checkOne(browser, keyword, blogId, postId);
  } finally {
    await browser.close().catch(() => {});
  }
}

/** 브라우저 인스턴스를 재사용하며 여러 (keyword, blogId, postId)를 순차 확인 (크론 배치용) */
export async function checkAiBriefingBatch(
  items: Array<{ keyword: string; blogId: string; postId: string }>,
  delayMs = 5_000,
): Promise<AiBriefingCheckResult[]> {
  const browser = await launchBrowser();
  const results: AiBriefingCheckResult[] = [];
  try {
    for (let i = 0; i < items.length; i++) {
      const { keyword, blogId, postId } = items[i];
      results.push(await checkOne(browser, keyword, blogId, postId));
      if (i < items.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

async function checkOne(browser: Browser, keyword: string, blogId: string, postId: string): Promise<AiBriefingCheckResult> {
  const empty = { hasAiBriefing: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null };
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });

    // AI 탭 전용 URL — ait_pv/ait_chat_id는 네이버가 세션 진입 시 서버에서 발급하는 값이라
    // 직접 구성하지 않고 ssc=tab.ait.all + query만으로 진입한다.
    const url = `https://search.naver.com/search.naver?ssc=tab.ait.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

    // 이 키워드로 AI 탭 자체가 제공되지 않으면 네이버가 통합검색 등으로 리다이렉트할 수 있음
    if (!page.url().includes('ssc=tab.ait.all')) {
      return { ...empty, hasAiBriefing: false };
    }

    await waitForStreamStable(page);

    const result = await page.evaluate(evaluateBriefing, {
      containerSelectors: CONTAINER_SELECTORS,
      sourceSelectors: SOURCE_SELECTORS,
      expandTexts: EXPAND_TEXTS,
      expandWaitMs: EXPAND_WAIT_MS,
    }) as BriefingEvalResult;

    if (result.answerTextLength < MIN_ANSWER_TEXT_LENGTH) {
      return { ...empty, hasAiBriefing: false };
    }

    const match = findMatch(result.sources, blogId, postId);
    return {
      hasAiBriefing: true,
      exposed: !!match,
      sourceIndex: match?.index ?? null,
      sourceTotal: result.sources.length || null,
      matchedTitle: match?.source.title || null,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await page?.close().catch(() => {});
  }
}
