import puppeteer, { type Browser, type Page } from 'puppeteer-core';

/**
 * 네이버 "AI" 탭(생성형 검색 답변) 노출 여부 확인 — 네이버메이트 기능의 핵심 엔진.
 *
 * ⚠️ 2026-07-04 실측 검증 완료 (scripts/test-ai-briefing.mjs 로컬 puppeteer 실행):
 * - AI 답변은 통합검색 결과에 끼워진 박스가 아니라 검색 후 클릭해 들어가는 전용
 *   "AI" 탭(`ssc=tab.ait.all`)이며, 챗봇처럼 답변이 문단 단위로 스트리밍된다.
 * - **`ssc=tab.ait.all` URL로 직접 goto하면 네이버가 "잘못된 접근입니다"로 거부한다.**
 *   반드시 일반 검색 결과 페이지에 먼저 진입한 뒤, 그 페이지 안의 실제 AI 탭
 *   <a> 앵커를 클릭(in-page navigation)해야 정상 진입된다 — referrer/세션 검증으로 추정.
 * - 실측 스트리밍 완료 시간은 키워드당 약 15~25초. 인용 출처는 `a[href*="blog.naver.com"]`
 *   형태로 실제 DOM에 존재함(추측이 아니라 실측 확인) — 다만 시각적으로는 별도 칩(span)이
 *   붙어있어 사람 눈엔 "인라인 칩"처럼 보이는 것.
 * - 답변 전체가 사실상 "브리핑"이라 컨테이너를 따로 특정하지 않고 document 전체에서
 *   텍스트 길이/링크를 본다 — 셀렉터 기반 컨테이너 탐색은 네이버가 매 배포마다 바꾸는
 *   해시 클래스명 때문에 신뢰도가 낮고, 실측 결과 body 레벨 판단으로 충분했다.
 * - 동일 키워드도 매 요청마다 인용 링크 개수가 달라짐(실측: 0개/3개 등 편차 확인) — AI 생성
 *   특성상 정상이며, 코드 버그가 아님. `hasAiBriefing`은 답변 텍스트 생성 여부만 판단하고
 *   `exposed`/`sourceTotal`은 매 확인 시점의 실제 결과를 그대로 반영한다.
 * - ⚠️ **자동화 탐지 주의**: 짧은 시간에 반복 요청하면(테스트 중 8회 정도 연속 실행 후 발생)
 *   AI 탭 클릭 경로가 맞아도 "잘못된 접근입니다" 문구로 막힌다. `BLOCKED_TEXT_MARKER`로 감지해
 *   `hasAiBriefing:false`가 아닌 별도 error로 반환 — 절대 "브리핑 없음"과 혼동하면 안 됨.
 *   짧은 간격의 반복 확인(배치/전체확인)은 이 차단을 유발할 위험이 실측으로 확인됨.
 * 참고: /Users/orange/개발/naver-ai-briefing-tracker (Playwright 기반 로컬 프로토타입)의
 * 매칭 로직(blogId+postId 파싱)은 그대로 유지.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;

// AI 탭은 챗봇처럼 답변이 스트리밍되므로 고정 대기 대신 텍스트가 안정될 때까지 폴링
// 실측 완료 시간이 최대 22.5초였던 것을 감안해 여유를 둠
const MAX_STREAM_WAIT_MS = 35_000;
const POLL_INTERVAL_MS = 1_000;
const STABLE_CHECKS_REQUIRED = 3; // 연속 3회(3초) 텍스트가 안 바뀌면 스트리밍 종료로 간주
const MIN_ANSWER_TEXT_LENGTH = 80; // 이 이하면 답변 미생성(hasAiBriefing=false)으로 간주

// 실측 확인: 짧은 시간에 반복 요청하면 네이버가 AI 탭 자체를 이 문구로 막아버림
// (클릭 경로가 맞아도 발생 — 봇/자동화 탐지로 추정). "브리핑 없음"과 반드시 구분해야
// 사용자가 "이 키워드는 AI 브리핑이 없다"로 오인하지 않는다.
const BLOCKED_TEXT_MARKER = '잘못된 접근입니다';

const SOURCE_SELECTORS = [
  'a[href*="blog.naver.com"]',
  'a[href*="m.blog.naver.com"]',
  'a[href*="cafe.naver.com"]',
  'a[href*="post.naver.com"]',
];

interface RawSource {
  url: string;
  title: string;
}

interface BriefingEvalResult {
  answerTextLength: number;
  sources: RawSource[];
  blocked: boolean;
}

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean;      // 이 키워드 검색 시 AI 탭 답변 자체가 생성되는지
  exposed: boolean;            // 답변 인용 출처 중 내 포스팅이 포함되는지
  sourceIndex: number | null;  // 출처 순번 (1부터)
  sourceTotal: number | null;  // 출처 총 개수
  matchedTitle: string | null; // 매칭된 출처 표시 제목
  error?: string;
}

/** 브라우저 컨텍스트 안에서 실행 — 문서 전체에서 답변 텍스트 길이 + 출처 링크 수집 */
function evaluateBriefing(sourceSelectors: string[], blockedMarker: string): BriefingEvalResult {
  const bodyText = document.body.innerText || '';
  if (bodyText.includes(blockedMarker)) {
    return { answerTextLength: 0, sources: [], blocked: true };
  }

  const seen = new Set<string>();
  const sources: RawSource[] = [];
  for (const sel of sourceSelectors) {
    document.querySelectorAll(sel).forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!href || seen.has(href)) return;
      seen.add(href);
      sources.push({ url: href, title: (link.textContent || '').trim() });
    });
  }
  return { answerTextLength: bodyText.length, sources, blocked: false };
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

/** 일반 검색 결과 페이지에서 실제 "AI" 탭 앵커를 찾아 클릭(in-page navigation)해 진입한다. */
async function enterAiTab(page: Page, keyword: string): Promise<boolean> {
  const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

  const hasAiTabLink = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all'));
  });
  if (!hasAiTabLink) return false; // 이 키워드는 AI 탭 자체가 제공되지 않음

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null),
    page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
      if (a) (a as HTMLElement).click();
    }),
  ]);

  return page.url().includes('ssc=tab.ait.all');
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

    const entered = await enterAiTab(page, keyword);
    if (!entered) return { ...empty, hasAiBriefing: false };

    await waitForStreamStable(page);

    const result = await page.evaluate(evaluateBriefing, SOURCE_SELECTORS, BLOCKED_TEXT_MARKER) as BriefingEvalResult;

    if (result.blocked) {
      // "브리핑 없음"과 구분되는 별도 에러 — API가 502로 응답해 "확인 실패"로 노출되고
      // "이 키워드는 AI 브리핑이 없다"로 오인되지 않도록 한다.
      return { ...empty, error: '네이버 AI 탭 접근이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.' };
    }

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
