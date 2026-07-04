import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * 네이버 "AI 브리핑"(생성형 검색 답변) 노출 여부 확인 — 네이버메이트 기능의 핵심 엔진.
 *
 * 키워드순위(check-missing)와 달리 AI 브리핑 영역은 검색 결과 HTML에 정적으로
 * 포함되지 않고 지연 로딩되므로(정적 fetch+cheerio로는 감지 불가, 직접 확인함)
 * 실제로 JS를 실행하는 헤드리스 브라우저가 필요하다.
 * 참고: /Users/orange/개발/naver-ai-briefing-tracker (Playwright 기반 로컬 프로토타입)의
 * 셀렉터/매칭 로직을 puppeteer-core 기반으로 이식.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;
const BRIEFING_WAIT_MS = 3_500; // AI 브리핑 지연 로딩 대기
const EXPAND_WAIT_MS = 700;     // "출처 전체보기" 클릭 후 렌더링 대기

// 네이버 DOM은 자주 바뀌므로 다중 셀렉터 + 텍스트 기반 fallback으로 견고하게 처리
const CONTAINER_SELECTORS = [
  'div[class*="ai_briefing" i]',
  'section[class*="ai_briefing" i]',
  'div[class*="AiBriefing"]',
  'div[id*="ai_briefing" i]',
  'div.sc_new._ai_briefing',
];

const SOURCE_SELECTORS = [
  'a[href*="blog.naver.com"]',
  'a[href*="m.blog.naver.com"]',
  'a[href*="cafe.naver.com"]',
  'a[href*="post.naver.com"]',
  'a[class*="source" i]',
  'li[class*="source" i] a',
  'div[class*="source" i] a',
];

const EXPAND_TEXTS = ['출처', '전체보기', '더보기', '참고 링크'];

interface RawSource {
  url: string;
  title: string;
  author: string;
}

interface BriefingEvalResult {
  hasBriefing: boolean;
  sources: RawSource[];
}

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean;      // 이 키워드 검색 시 AI 브리핑 자체가 노출되는지
  exposed: boolean;            // AI 브리핑 출처 중 내 포스팅이 포함되는지
  sourceIndex: number | null;  // 출처 카드 내 순번 (1부터)
  sourceTotal: number | null;  // 출처 카드 총 개수
  matchedTitle: string | null; // 매칭된 출처 카드 표시 제목
  error?: string;
}

/** 브라우저 컨텍스트 안에서 실행 — AI 브리핑 영역 탐색 + 출처 더보기 확장 + 링크 수집 */
async function evaluateBriefing(args: {
  containerSelectors: string[];
  sourceSelectors: string[];
  expandTexts: string[];
  expandWaitMs: number;
}): Promise<BriefingEvalResult> {
  const { containerSelectors, sourceSelectors, expandTexts, expandWaitMs } = args;

  function findBriefing(): Element | null {
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // 헤딩 텍스트 기반 fallback (DOM 클래스명이 바뀐 경우)
    const headings = Array.from(document.querySelectorAll('h2, h3, strong'));
    const heading = headings.find(h => (h.textContent || '').includes('AI 브리핑'));
    if (heading) {
      return heading.closest('section') || heading.closest('div.sc_new') || heading.parentElement;
    }
    return null;
  }

  const briefing = findBriefing();
  if (!briefing) return { hasBriefing: false, sources: [] };

  // "출처 전체보기" 류 버튼 확장 시도
  const clickable = Array.from(briefing.querySelectorAll('a, button, span'));
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
    const links = briefing.querySelectorAll(sel);
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
  return { hasBriefing: true, sources };
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
 * keyword로 네이버 검색 → AI 브리핑 노출 여부 + (노출 시) 내 포스팅의 출처 인덱스를 확인한다.
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

    const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await new Promise(r => setTimeout(r, BRIEFING_WAIT_MS));

    const result = await page.evaluate(evaluateBriefing, {
      containerSelectors: CONTAINER_SELECTORS,
      sourceSelectors: SOURCE_SELECTORS,
      expandTexts: EXPAND_TEXTS,
      expandWaitMs: EXPAND_WAIT_MS,
    }) as BriefingEvalResult;

    if (!result.hasBriefing) return { ...empty, hasAiBriefing: false };

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
