import puppeteer, { type Browser, type Page } from 'puppeteer-core';

/**
 * 네이버 "AI" 탭(생성형 검색 답변) 노출 여부 확인 — 네이버메이트 기능의 핵심 엔진.
 *
 * ⚠️ 2026-07-04 실측 검증 + 2026-07-04(2차) 오렌지 피드백 반영:
 * - 상단 검색결과 탭 메뉴의 "AI" 탭(`ssc=tab.ait.all`) 링크는 거의 모든 키워드에서 항상
 *   존재한다(블로그/이미지 탭과 같은 방식의 고정 메뉴 항목). 따라서 "그 링크가 있는지"만
 *   보고 노출 여부를 판단하면 사실상 항상 "있음"이 되는 오탐이 발생한다(2026-07-04 2차
 *   실측 확인 — 오렌지가 스크린샷으로 제보).
 * - 실제로 탭을 클릭해 들어가면, 콘텐츠 최상단에 네이버가 붙이는 공식 라벨
 *   "✨ AI 브리핑 실험 단계로 정확하지 않을 수 있어요"가 있다(오렌지 제공 스크린샷으로 확인).
 *   즉 "AI 브리핑"은 그 탭 안에서 실제로 생성되는 콘텐츠의 네이버 공식 명칭이며, "AI 탭"과
 *   별개의 위치에 있는 기능이 아니다.
 * - 따라서 이 모듈은 두 가지를 "독립된" 결과로 계산해 반환한다:
 *   1) hasAiBriefing — 탭에 들어갔을 때 실제 "AI 브리핑" 콘텐츠가 생성됐는지(인용 여부 무관)
 *   2) exposed        — 그 콘텐츠의 출처 목록에 내 특정 게시글(blogId+logNo 기준 매칭)이
 *      포함되는지. hasAiBriefing이 false면 출처 목록 자체가 없으므로 exposed도 항상 false.
 * - **`ssc=tab.ait.all` URL로 직접 goto하면 네이버가 "잘못된 접근입니다"로 거부한다.**
 *   반드시 일반 검색 결과 페이지에 먼저 진입한 뒤, 그 페이지 안의 실제 AI 탭
 *   <a> 앵커를 클릭(in-page navigation)해야 정상 진입된다 — referrer/세션 검증으로 추정.
 * - 실측 스트리밍 완료 시간은 키워드당 약 15~25초. 인용 출처는 `a[href*="blog.naver.com"]`
 *   형태로 실제 DOM에 존재함(추측이 아니라 실측 확인) — 다만 시각적으로는 별도 칩(span)이
 *   붙어있어 사람 눈엔 "인라인 칩"처럼 보이는 것.
 * - 동일 키워드도 매 요청마다 인용 링크 개수가 달라짐(실측: 0개/3개 등 편차 확인) — AI 생성
 *   특성상 정상이며, 코드 버그가 아니다.
 * - ⚠️ **자동화 탐지 주의**: 짧은 시간에 반복 요청하면(2026-07-04 2차 실측: curl 테스트 몇 번 후
 *   Puppeteer 클릭 진입도 곧바로 차단됨) AI 탭 클릭 경로가 맞아도 "잘못된 접근입니다" 문구로
 *   막힌다. `BLOCKED_TEXT_MARKER`로 감지해 `hasAiBriefing:false`가 아닌 별도 error로 반환 —
 *   절대 "브리핑 없음"과 혼동하면 안 됨. 짧은 간격의 반복 확인(배치/전체확인)은 이 차단을
 *   유발할 위험이 실측으로 재확인됨 — 배치/자동 반복 실행은 여전히 지원하지 않는다.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;

// AI 탭은 챗봇처럼 답변이 스트리밍되므로 고정 대기 대신 텍스트가 안정될 때까지 폴링
const MAX_STREAM_WAIT_MS = 35_000;
const POLL_INTERVAL_MS = 1_000;
const STABLE_CHECKS_REQUIRED = 3; // 연속 3회(3초) 텍스트가 안 바뀌면 스트리밍 종료로 간주
const MIN_ANSWER_TEXT_LENGTH = 80; // 이 이하면 답변 미생성(hasAiBriefing=false)으로 간주

// 네이버가 실제 콘텐츠 상단에 붙이는 공식 라벨 — "탭 존재"와 "실제 브리핑 생성"을 구분하는 핵심 신호
const BRIEFING_LABEL_MARKER = 'AI 브리핑';

// 실측 확인: 짧은 시간에 반복 요청하면 네이버가 AI 탭 자체를 이 문구로 막아버림
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
  hasBriefingLabel: boolean;
  sources: RawSource[];
  blocked: boolean;
}

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean;      // AI 브리핑 컬럼: 이 키워드 검색 시 AI 브리핑 콘텐츠 자체가 생성되는지
  exposed: boolean;            // AI 탭 컬럼: 브리핑 출처 중 내 포스팅(blogId+postId)이 포함되는지
  sourceIndex: number | null;  // 출처 순번 (1부터)
  sourceTotal: number | null;  // 출처 총 개수
  matchedTitle: string | null; // 매칭된 출처 표시 제목
  error?: string;
}

/** 브라우저 컨텍스트 안에서 실행 — 문서 전체에서 "AI 브리핑" 라벨 + 답변 텍스트 길이 + 출처 링크 수집 */
function evaluateBriefing(sourceSelectors: string[], blockedMarker: string, briefingLabelMarker: string): BriefingEvalResult {
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

/** blogId(대소문자 무관) + logNo(postId) 기준으로 출처 목록에서 내 게시글을 찾는다 — URL 문자열 단순 비교가 아님 */
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

/**
 * keyword로 네이버 "AI" 탭에 진입 → AI 브리핑 콘텐츠 생성 여부(hasAiBriefing) +
 * (생성 시) 내 포스팅의 인용 여부(exposed)를 각각 독립적으로 확인한다.
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

    const result = await page.evaluate(
      evaluateBriefing, SOURCE_SELECTORS, BLOCKED_TEXT_MARKER, BRIEFING_LABEL_MARKER,
    ) as BriefingEvalResult;

    if (result.blocked) {
      // "브리핑 없음"과 구분되는 별도 에러 — API가 502로 응답해 "확인 실패"로 노출되고
      // "이 키워드는 AI 브리핑이 없다"로 오인되지 않도록 한다.
      return { ...empty, error: '네이버 AI 탭 접근이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.' };
    }

    // "AI 브리핑" 공식 라벨 + 최소 답변 길이를 함께 요구 — 탭 메뉴 존재만으로는 판단하지 않는다.
    const hasAiBriefing = result.hasBriefingLabel && result.answerTextLength >= MIN_ANSWER_TEXT_LENGTH;
    if (!hasAiBriefing) {
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
