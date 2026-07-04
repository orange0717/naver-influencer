import puppeteer, { type Browser, type Page } from 'puppeteer-core';

/**
 * 네이버 "AI 브리핑"(통합검색 인라인 위젯) + "AI 탭"(ssc=tab.ait.all) 노출 여부 확인
 * — 네이버메이트 기능의 핵심 엔진.
 *
 * ⚠️ 2026-07-04(4차) 오렌지 실측 제보로 아키텍처 전면 재검토:
 * - 이전(3차)까지는 "AI 탭에 들어갔을 때 보이는 콘텐츠"를 "AI 브리핑"이라고 잘못 가정했다
 *   (탭 안에 "AI 브리핑" 뱃지가 보인 스크린샷 때문). 하지만 오렌지가 반복적으로
 *   "AI 브리핑과 AI 탭은 서로 다른 서비스"라고 지적했고, 직접 통합검색(일반 검색결과) 페이지를
 *   실측 확인한 결과 — **"AI 브리핑"은 AI 탭과 무관하게, 일반 통합검색 결과 페이지 안에
 *   그 자체로 존재하는 별도의 인라인 위젯**이었다(내부 클래스명 전부 `fds-aib-*` 접두사 —
 *   "AI Briefing"의 약자로 추정). "펼쳐서 더보기" 버튼으로 펼치는 요약 카드 + "관련 질문" +
 *   "출처 N건 전체보기" 형태로, AI 탭(`ssc=tab.ait.all`, 클릭해서 들어가는 전체화면 채팅형 UI)과
 *   완전히 다른 DOM 위치·다른 출처 목록을 가진다.
 * - 따라서 이 모듈은 이제 **두 화면을 각각 별도로 방문·평가**해서 완전히 독립된 결과를 만든다:
 *   1) AI 브리핑 — 일반 검색결과 페이지(`search.naver.com/search.naver?query=...`)에 진입해
 *      `[class*="fds-aib"]` 위젯이 실제로 렌더링되는지 + "펼쳐서 더보기"로 펼친 뒤 그 안의
 *      출처 목록에 내 게시글(blogId+logNo)이 포함되는지.
 *   2) AI 탭 — 그 페이지 안의 실제 "AI" 탭 앵커를 클릭해 들어가서, 스트리밍 완료 후 콘텐츠와
 *      그 출처 목록에 내 게시글이 포함되는지.
 * - 두 결과는 서로의 값에 절대 영향을 주지 않는다 — "AI 브리핑 없음 + AI 탭 있음"처럼 어느
 *   조합도 나올 수 있다(같은 키워드라도 두 기능이 서로 다른 소스 큐레이션을 쓰기 때문).
 * - "있음" 판정은 반드시 **인용(citation) 매칭까지 성공했을 때만** — 콘텐츠가 생성됐다는 사실
 *   만으로는 "있음"으로 표시하지 않는다(콘텐츠 생성됐지만 내 글이 인용 안 된 경우는 "없음").
 * - 인용 매칭은 blogId(대소문자 무관) + logNo(postId) 조합으로 정확히 일치하는 URL만 인정한다
 *   (`extractBlogPost`/`findMatch` — 같은 블로그의 다른 글이 인용된 경우 매칭되지 않도록
 *   postId까지 반드시 비교, URL 문자열 단순 비교 아님).
 * - **`ssc=tab.ait.all` URL로 직접 goto하면 네이버가 "잘못된 접근입니다"로 거부한다.**
 *   반드시 일반 검색 결과 페이지에 먼저 진입한 뒤, 그 페이지 안의 실제 AI 탭
 *   <a> 앵커를 클릭(in-page navigation)해야 정상 진입된다 — referrer/세션 검증으로 추정.
 * - ⚠️ **자동화 탐지 주의**: 짧은 시간에 반복 요청하면 네이버가 "잘못된 접근입니다" 문구로
 *   막는다(실측 확인됨). `BLOCKED_TEXT_MARKER`로 감지해 "없음"이 아닌 별도 error로 반환 —
 *   절대 "없음"과 혼동하면 안 됨. 배치/자동 반복 실행은 여전히 지원하지 않는다(단건 온디맨드만).
 * - 두 화면을 순차 방문하므로 건당 소요 시간이 늘어난다(대략 30~50초) — route의
 *   maxDuration을 이에 맞춰 넉넉히 잡아야 한다.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;

// AI 탭은 챗봇처럼 답변이 스트리밍되므로 고정 대기 대신 텍스트가 안정될 때까지 폴링
const MAX_STREAM_WAIT_MS = 35_000;
const POLL_INTERVAL_MS = 1_000;
const STABLE_CHECKS_REQUIRED = 3; // 연속 3회(3초) 텍스트가 안 바뀌면 스트리밍/렌더링 종료로 간주

// AI 브리핑 위젯은 통합검색 페이지 진입 후 비동기로 늦게 렌더링된다 — 최대 대기 시간
const MAX_WIDGET_WAIT_MS = 20_000;

// 탭 진입 시 항상 붙는 고정 UI(네비 메뉴 + 하단 disclaimer + 챗봇 placeholder 문구)만으로는
// 대략 100~150자 내외로 추정되므로, 실제 생성된 콘텐츠(문단/표)와 확실히 구분되도록 여유를 두고
// 300자로 설정. "AI 브리핑" 라벨 문구가 있으면 그 자체로 강한 신호로 인정(OR 조건).
const MIN_ANSWER_TEXT_LENGTH = 300;
const BRIEFING_LABEL_MARKER = 'AI 브리핑';

// 실측 확인: 짧은 시간에 반복 요청하면 네이버가 페이지 자체를 이 문구로 막아버림
const BLOCKED_TEXT_MARKER = '잘못된 접근입니다';

// AI 브리핑 인라인 위젯의 내부 컴포넌트는 전부 이 접두사 클래스를 쓴다(실측 확인, 2026-07-04 4차)
const WIDGET_SELECTOR = '[class*="fds-aib"]';
const WIDGET_EXPAND_BUTTON_TEXT = '펼쳐서 더보기';

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

interface SurfaceEvalResult {
  answerTextLength: number;
  hasBriefingLabel: boolean;
  sources: RawSource[];
  blocked: boolean;
}

interface SurfaceResult {
  has: boolean;
  exposed: boolean;
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
}

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean;         // AI 브리핑(통합검색 인라인 위젯) 콘텐츠 생성 여부
  exposed: boolean;               // AI 브리핑 출처에 내 게시글(blogId+logNo) 포함 여부
  sourceIndex: number | null;     // AI 브리핑 출처 순번 (1부터)
  sourceTotal: number | null;     // AI 브리핑 출처 총 개수
  matchedTitle: string | null;    // AI 브리핑에서 매칭된 출처 표시 제목
  hasAiTab: boolean;              // AI 탭 콘텐츠 생성 여부
  tabExposed: boolean;            // AI 탭 출처에 내 게시글 포함 여부
  tabSourceIndex: number | null;  // AI 탭 출처 순번
  tabSourceTotal: number | null;  // AI 탭 출처 총 개수
  tabMatchedTitle: string | null; // AI 탭에서 매칭된 출처 표시 제목
  error?: string;
}

/** 브라우저 컨텍스트 안에서 실행 — document 전체 기준(AI 탭 전용, 탭 페이지는 콘텐츠가 전체 화면) */
function evaluateWholeDocument(sourceSelectors: string[], blockedMarker: string, briefingLabelMarker: string): SurfaceEvalResult {
  const bodyText = document.body.innerText || '';
  if (bodyText.includes(blockedMarker)) {
    return { answerTextLength: 0, hasBriefingLabel: false, sources: [], blocked: true };
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
  return {
    answerTextLength: bodyText.length,
    hasBriefingLabel: bodyText.includes(briefingLabelMarker),
    sources,
    blocked: false,
  };
}

/**
 * 브라우저 컨텍스트 안에서 실행 — AI 브리핑 위젯 전용. `[class*="fds-aib"]` 로 매칭되는
 * 노드들만 모아 그 안의 텍스트/출처 링크만 집계한다(문서 전체가 아니라 위젯으로 정확히 스코프).
 */
function evaluateWidget(widgetSelector: string, sourceSelectors: string[], blockedMarker: string, briefingLabelMarker: string): SurfaceEvalResult {
  const bodyText = document.body.innerText || '';
  if (bodyText.includes(blockedMarker)) {
    return { answerTextLength: 0, hasBriefingLabel: false, sources: [], blocked: true };
  }

  const nodes = Array.from(document.querySelectorAll(widgetSelector));
  if (nodes.length === 0) {
    return { answerTextLength: 0, hasBriefingLabel: false, sources: [], blocked: false };
  }

  let combinedText = '';
  for (const node of nodes) combinedText += (node.textContent || '') + '\n';

  const seen = new Set<string>();
  const sources: RawSource[] = [];
  for (const node of nodes) {
    for (const sel of sourceSelectors) {
      node.querySelectorAll(sel).forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        sources.push({ url: href, title: (link.textContent || '').trim() });
      });
    }
  }

  return {
    answerTextLength: combinedText.length,
    hasBriefingLabel: combinedText.includes(briefingLabelMarker),
    sources,
    blocked: false,
  };
}

/** 텍스트 길이가 안정될 때까지 폴링(고정 대기 대신) — measureFn이 현재 길이를 반환 */
async function waitForTextStable(page: Page, measureFn: () => number): Promise<void> {
  let lastLength = -1;
  let stableCount = 0;
  const start = Date.now();

  while (Date.now() - start < MAX_STREAM_WAIT_MS) {
    const length = await page.evaluate(measureFn).catch(() => 0);
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

/** AI 브리핑 위젯이 나타날 때까지 폴링(늦게 비동기로 렌더링되거나, 아예 안 나타날 수도 있음) */
async function waitForWidgetToAppear(page: Page, widgetSelector: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < MAX_WIDGET_WAIT_MS) {
    const count = await page.evaluate(sel => document.querySelectorAll(sel).length, widgetSelector).catch(() => 0);
    if (count > 0) return true;
    await new Promise(r => setTimeout(r, 1_000));
  }
  return false;
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

/** blogId(대소문자 무관) + logNo(postId) 기준으로 출처 목록에서 내 게시글을 찾는다 — URL 문자열 단순 비교가 아님. 같은 블로그의 다른 글은 매칭되지 않는다. */
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

/** 평가 결과 + blogId/postId를 조합해 최종 SurfaceResult(있음/없음 + 출처 정보)를 만든다 */
function toSurfaceResult(evalResult: SurfaceEvalResult, blogId: string, postId: string): SurfaceResult {
  const has = evalResult.hasBriefingLabel || evalResult.answerTextLength >= MIN_ANSWER_TEXT_LENGTH;
  if (!has) {
    return { has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null };
  }
  const match = findMatch(evalResult.sources, blogId, postId);
  return {
    has: true,
    exposed: !!match,
    sourceIndex: match?.index ?? null,
    sourceTotal: evalResult.sources.length || null,
    matchedTitle: match?.source.title || null,
  };
}

/**
 * Vercel(서버리스)에서는 @sparticuz/chromium 바이너리를, 로컬 개발에서는 시스템 Chrome을 사용한다.
 * 로컬 Chrome 경로가 다르면 LOCAL_CHROME_EXECUTABLE_PATH 환경변수로 지정.
 */
async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // ⚠️ 2026-07-04 실측 확인: Vercel의 Node 서버리스 함수는 실제로 AWS Lambda 위에서 돌지만
    // @sparticuz/chromium이 환경 감지에 쓰는 AWS_EXECUTION_ENV/AWS_LAMBDA_JS_RUNTIME 값을
    // 노출하지 않는다. 그 결과 라이브러리가 al2023.tar.br(공유 라이브러리 묶음, libnss3.so 포함)를
    // 추출하지 않아 "libnss3.so: cannot open shared object file" 로 브라우저 실행 자체가 실패했다
    // (프로덕션에서 500 즉시 실패로 재현·확인됨). import 전에 신호를 직접 주입해 추출을 강제한다.
    process.env.AWS_LAMBDA_JS_RUNTIME ??= 'nodejs22.x';
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
 * 일반 통합검색 결과 페이지에 진입해 "AI 브리핑" 인라인 위젯을 확인한다.
 * 위젯이 렌더링되면 "펼쳐서 더보기" 버튼을 클릭해 전체 콘텐츠 + 출처 목록을 펼친 뒤 평가한다.
 */
async function checkBriefingWidget(page: Page, keyword: string, blogId: string, postId: string): Promise<SurfaceResult & { blocked: boolean }> {
  const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

  const blockedEarly = await page.evaluate(marker => (document.body.innerText || '').includes(marker), BLOCKED_TEXT_MARKER).catch(() => false);
  if (blockedEarly) {
    return { has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, blocked: true };
  }

  const appeared = await waitForWidgetToAppear(page, WIDGET_SELECTOR);
  if (!appeared) {
    // 위젯 자체가 렌더링되지 않음 — 이 키워드는 AI 브리핑이 노출되지 않는 것으로 간주
    return { has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, blocked: false };
  }

  // 텍스트 길이가 안정될 때까지 대기(비동기 스트리밍/렌더링 완료 대기)
  await waitForTextStable(page, () => {
    const nodes = Array.from(document.querySelectorAll('[class*="fds-aib"]'));
    return nodes.reduce((sum, n) => sum + (n.textContent || '').length, 0);
  });

  // "펼쳐서 더보기" 버튼이 있으면 클릭해 전체 콘텐츠/출처를 펼친다
  await page.evaluate((selector, expandText) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    const btn = nodes.find(el => (el.textContent || '').includes(expandText));
    if (btn) (btn as HTMLElement).click();
  }, WIDGET_SELECTOR, WIDGET_EXPAND_BUTTON_TEXT).catch(() => {});
  await new Promise(r => setTimeout(r, 3_000));

  const evalResult = await page.evaluate(
    evaluateWidget, WIDGET_SELECTOR, SOURCE_SELECTORS, BLOCKED_TEXT_MARKER, BRIEFING_LABEL_MARKER,
  ) as SurfaceEvalResult;

  if (evalResult.blocked) {
    return { has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, blocked: true };
  }

  return { ...toSurfaceResult(evalResult, blogId, postId), blocked: false };
}

/** 일반 검색 결과 페이지에서 실제 "AI" 탭 앵커를 찾아 클릭(in-page navigation)해 진입한다. */
async function enterAiTab(page: Page, keyword: string): Promise<boolean> {
  const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

  const hasAiTabLink = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all'));
  });
  if (!hasAiTabLink) return false; // 이 키워드는 AI 탭 메뉴 자체가 제공되지 않음(드묾)

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null),
    page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
      if (a) (a as HTMLElement).click();
    }),
  ]);

  return page.url().includes('ssc=tab.ait.all');
}

/** AI 탭에 진입해 콘텐츠 생성 여부 + 출처 인용 여부를 확인한다. */
async function checkAiTab(page: Page, keyword: string, blogId: string, postId: string): Promise<SurfaceResult & { blocked: boolean }> {
  const entered = await enterAiTab(page, keyword);
  if (!entered) {
    return { has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, blocked: false };
  }

  await waitForTextStable(page, () => (document.body?.innerText || '').length);

  const evalResult = await page.evaluate(
    evaluateWholeDocument, SOURCE_SELECTORS, BLOCKED_TEXT_MARKER, BRIEFING_LABEL_MARKER,
  ) as SurfaceEvalResult;

  if (evalResult.blocked) {
    return { has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, blocked: true };
  }

  return { ...toSurfaceResult(evalResult, blogId, postId), blocked: false };
}

/**
 * keyword로 (1) 통합검색 "AI 브리핑" 인라인 위젯과 (2) "AI" 탭을 각각 독립적으로 방문해
 * 콘텐츠 생성 여부 + 내 포스팅의 인용 여부(blogId+logNo 기준)를 확인한다.
 * ⚠️ 이용약관/서버 부하/자동화 탐지 리스크 때문에 배치 실행은 지원하지 않는다 — 반드시
 * 사용자가 선택한 포스팅 1건에 대해서만, 온디맨드로 단건 호출한다 (naver-mate 페이지 참고).
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

const EMPTY_RESULT: Omit<AiBriefingCheckResult, 'error'> = {
  hasAiBriefing: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null,
  hasAiTab: false, tabExposed: false, tabSourceIndex: null, tabSourceTotal: null, tabMatchedTitle: null,
};

async function checkOne(browser: Browser, keyword: string, blogId: string, postId: string): Promise<AiBriefingCheckResult> {
  const BLOCKED_ERROR = '네이버 접근이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.';
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });

    // 1) AI 브리핑(통합검색 인라인 위젯) — 독립적으로 확인
    const briefing = await checkBriefingWidget(page, keyword, blogId, postId);
    if (briefing.blocked) {
      return { ...EMPTY_RESULT, error: BLOCKED_ERROR };
    }

    // 2) AI 탭 — 완전히 별도로 재진입해서 확인(위젯 결과와 서로 영향 없음)
    const tab = await checkAiTab(page, keyword, blogId, postId);
    if (tab.blocked) {
      // 브리핑은 정상 확인됐지만 탭 확인 중 차단된 경우 — 절반의 결과라도 "없음"으로
      // 단정하지 않도록 에러로 반환한다(캐시되지 않아 다음 시도가 바로 재확인 가능).
      return { ...EMPTY_RESULT, error: BLOCKED_ERROR };
    }

    return {
      hasAiBriefing: briefing.has,
      exposed: briefing.exposed,
      sourceIndex: briefing.sourceIndex,
      sourceTotal: briefing.sourceTotal,
      matchedTitle: briefing.matchedTitle,
      hasAiTab: tab.has,
      tabExposed: tab.exposed,
      tabSourceIndex: tab.sourceIndex,
      tabSourceTotal: tab.sourceTotal,
      tabMatchedTitle: tab.matchedTitle,
    };
  } catch (e) {
    return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await page?.close().catch(() => {});
  }
}
