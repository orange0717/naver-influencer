import puppeteer, { type Browser, type Page, type HTTPRequest } from 'puppeteer-core';

/**
 * 네이버 "AI 브리핑"(통합검색 인라인 위젯) + "AI 탭"(ssc=tab.ait.all) 노출 여부 확인
 * — 'AI 브리핑 · AI 탭' 기능(구 네이버메이트)의 핵심 엔진.
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
 * - 따라서 이 모듈은 **두 화면을 각각 별도로 평가**해서 완전히 독립된 결과를 만든다:
 *   1) AI 브리핑 — 일반 검색결과 페이지(`search.naver.com/search.naver?query=...`)에서
 *      `[class*="fds-aib"]` 위젯이 실제로 렌더링되는지 + "펼쳐서 더보기"로 펼친 뒤 그 안의
 *      출처 목록에 내 게시글(blogId+logNo)이 포함되는지.
 *   2) AI 탭 — 같은 페이지 안의 실제 "AI" 탭 앵커를 클릭해 들어가서, 스트리밍 완료 후 콘텐츠와
 *      그 출처 목록에 내 게시글이 포함되는지.
 * - 두 결과는 서로의 값에 절대 영향을 주지 않는다 — "AI 브리핑 미인용 + AI 탭 인용"처럼 어느
 *   조합도 나올 수 있다(같은 키워드라도 두 기능이 서로 다른 소스 큐레이션을 쓰기 때문).
 * - "인용" 판정은 반드시 **인용(citation) 매칭까지 성공했을 때만** — 콘텐츠가 생성됐다는 사실
 *   만으로는 "인용"으로 표시하지 않는다.
 * - 인용 매칭은 blogId(대소문자 무관) + logNo(postId) 조합으로 정확히 일치하는 URL만 인정한다
 *   (`extractBlogPost`/`findMatch` — 같은 블로그의 다른 글이 인용된 경우 매칭되지 않도록
 *   postId까지 반드시 비교, URL 문자열 단순 비교 아님).
 * - **`ssc=tab.ait.all` URL로 직접 goto하면 네이버가 "잘못된 접근입니다"로 거부한다.**
 *   반드시 일반 검색 결과 페이지에 먼저 진입한 뒤, 그 페이지 안의 실제 AI 탭
 *   <a> 앵커를 클릭(in-page navigation)해야 정상 진입된다 — referrer/세션 검증으로 추정.
 * - ⚠️ **자동화 탐지 주의**: 짧은 시간에 반복 요청하면 네이버가 "잘못된 접근입니다" 문구로
 *   막는다(실측 확인됨). `BLOCKED_TEXT_MARKER`로 감지해 별도 error로 반환.
 *
 * 2026-07-04(5차) 오렌지 지시로 성능 최적화 진행 — 정확도는 그대로 유지하면서 건당 소요 시간을
 * 단축하기 위해 다음을 적용했다:
 * 1) **중복 페이지 이동 제거** — 기존엔 AI 브리핑 확인 후 AI 탭 확인을 위해 같은 검색 결과
 *    페이지로 다시 goto했다(같은 키워드 검색을 2번 수행). 이제 한 번만 진입하고, 그 상태에서
 *    바로 AI 탭 앵커를 클릭해 들어간다 — 페이지 로드 1회 완전히 제거.
 * 2) **폴링 → 이벤트 기반 대기** — `waitForWidgetToAppear`(1초 간격 폴링)를 Puppeteer 내장
 *    `page.waitForSelector`로 교체(브라우저 내부적으로 훨씬 빠르게 반응). 텍스트 안정화 대기도
 *    Node↔브라우저 왕복 폴링 대신, 브라우저 컨텍스트 안에서 MutationObserver + debounce로
 *    "더 이상 DOM이 안 바뀜"을 즉시 감지하도록 재작성(`waitForContentStable`) — 실제 스트리밍이
 *    멈춘 시점에 훨씬 가깝게 반응하고, 왕복 오버헤드가 없다.
 * 3) **고정 sleep 제거** — "펼쳐서 더보기" 클릭 후 무조건 3초 기다리던 부분을 위와 동일한
 *    MutationObserver 기반 동적 대기로 교체(콘텐츠가 이미 펼쳐져 있으면 훨씬 빨리 통과).
 * 4) **리소스 차단** — 이미지/폰트/미디어 리소스는 판정 로직(텍스트/링크)과 무관하므로 요청
 *    자체를 차단(page.setRequestInterception). 스타일시트는 의도적으로 차단하지 않는다 —
 *    `document.body.innerText`(AI 탭 판정에 사용)는 CSS 렌더링에 의존하므로(예: display:none
 *    요소 제외) 스타일을 차단하면 정확도가 깨질 수 있다.
 * 5) **브라우저 프로세스 재사용** — 서버리스 컨테이너가 warm 상태로 재사용될 때 매번 Chromium을
 *    새로 띄우지 않도록 모듈 스코프에 브라우저 인스턴스를 캐싱(`getBrowser`). 페이지(탭)는 요청마다
 *    새로 열고 닫지만, 가장 비용이 큰 브라우저 프로세스 기동은 warm 컨테이너에서 생략된다.
 * 6) **단계별 소요 시간 로깅** — 병목 구간 파악을 위해 launch/setup/search/briefing/tab/compare
 *    각 구간의 소요 시간을 콘솔에 구조화 로그로 남긴다(Vercel 함수 로그에서 확인 가능).
 * 7) **진행 단계 콜백** — `checkAiBriefingExposure`에 선택적 `onStage` 콜백을 추가해 프론트엔드가
 *    "검색 중 → AI 브리핑 확인 중 → AI 탭 확인 중 → 출처 비교 중" 진행 상황을 실시간으로 표시할
 *    수 있도록 지원한다(check-ai-briefing route에서 스트리밍 응답으로 중계).
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;

// 콘텐츠 안정화 대기 — MutationObserver가 마지막 변경 이후 이 시간(ms) 동안 추가 변경이 없으면
// "스트리밍/렌더링 종료"로 간주(고정 폴링 대비 실제 종료 시점에 훨씬 가깝게 반응).
const STABLE_DEBOUNCE_MS = 900;
const MAX_STREAM_WAIT_MS = 35_000; // 그래도 끝나지 않을 경우의 안전장치(최대 대기)

// "펼쳐서 더보기" 클릭 직후 펼쳐지는 콘텐츠는 보통 즉시 렌더링되므로 더 짧은 debounce/상한 사용
const EXPAND_DEBOUNCE_MS = 500;
const EXPAND_MAX_WAIT_MS = 4_000;

// AI 브리핑 위젯은 통합검색 페이지 진입 후 비동기로 늦게 렌더링된다 — 최대 대기 시간
const MAX_WIDGET_WAIT_MS = 20_000;

// 탭 진입 시 항상 붙는 고정 UI(네비 메뉴 + 하단 disclaimer + 챗봇 placeholder 문구)만으로는
// 대략 100~150자 내외로 추정되므로, 실제 생성된 콘텐츠(문단/표)와 확실히 구분되도록 여유를 두고
// 300자로 설정. "AI 브리핑" 라벨 문구가 있으면 그 자체로 강한 신호로 인정(OR 조건).
const MIN_ANSWER_TEXT_LENGTH = 300;
const BRIEFING_LABEL_MARKER = 'AI 브리핑';

// 실측 확인: 짧은 시간에 반복 요청하면 네이버가 페이지 자체를 이 문구로 막아버림
const BLOCKED_TEXT_MARKER = '잘못된 접근입니다';

// AI 탭 답변 생성 중에는 이 버튼(aria-label="중지")이 보이다가, 생성이 완전히 끝나면 사라진다.
// ⚠️ 2026-07-05 실측 확인된 버그 원인: AI 탭은 "생각 중" 단계에서 스켈레톤이 드문드문 갱신되다가
// 실제 답변+출처 스트리밍은 한참(10초 이상) 뒤에 시작된다. 그 "생각 중" 단계에도 900ms 넘는
// 조용한 구간이 여러 번 있어서, DOM-mutation debounce(`waitForContentStable`)만으로는 스트리밍이
// 실제로 끝나기 훨씬 전(본문 100자 안팎, 출처 0건)에 "안정됨"으로 오판하고 그 시점의 텅 빈 DOM을
// 평가해버린다 — 실제로는 인용된 글이 나중에(보통 20~25초 뒤) 출처에 포함되는데도 "미인용"으로
// 잘못 판정되는 원인이었다. 이 버튼의 등장→소멸을 1차 신호로 사용해 진짜 스트리밍 종료 시점을
// 잡고, 이후 `waitForContentStable`은 그 뒤의 미세한 후처리 렌더링을 잡는 2차 안전장치로만 쓴다.
const STOP_BUTTON_SELECTOR = 'button[aria-label="중지"]';
const STOP_BUTTON_APPEAR_TIMEOUT_MS = 5_000; // 이미 다른 이유로 빨리 끝난 경우도 있으니 못 찾아도 치명적이지 않음
const STOP_BUTTON_DISAPPEAR_TIMEOUT_MS = 35_000; // MAX_STREAM_WAIT_MS와 동일한 안전 상한

// AI 브리핑 인라인 위젯의 내부 컴포넌트는 전부 이 접두사 클래스를 쓴다(실측 확인, 2026-07-04 4차)
const WIDGET_SELECTOR = '[class*="fds-aib"]';
const WIDGET_EXPAND_BUTTON_TEXT = '펼쳐서 더보기';

const SOURCE_SELECTORS = [
  'a[href*="blog.naver.com"]',
  'a[href*="m.blog.naver.com"]',
  'a[href*="cafe.naver.com"]',
  'a[href*="post.naver.com"]',
];

// 판정 로직(텍스트/링크)과 무관한 리소스 — 차단해도 정확도에 영향 없음.
// ⚠️ 'stylesheet'는 의도적으로 제외: evaluateWholeDocument가 쓰는 innerText는 CSS 렌더링 결과에
// 의존하므로(display:none 요소 제외 등) 스타일 차단 시 오탐 위험이 있다.
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

export type AiBriefingStage = 'searching' | 'briefing' | 'tab' | 'comparing';

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
  matchedUrl: string | null;   // 인용 근거 URL(스펙 #8/#19) — 매칭된 내 글의 출처 URL
}

const EMPTY_SURFACE: SurfaceResult = {
  has: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, matchedUrl: null,
};

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean;         // AI 브리핑(통합검색 인라인 위젯) 콘텐츠 생성 여부
  exposed: boolean;               // AI 브리핑 출처에 내 게시글(blogId+logNo) 포함 여부
  sourceIndex: number | null;     // AI 브리핑 출처 순번 (1부터)
  sourceTotal: number | null;     // AI 브리핑 출처 총 개수
  matchedTitle: string | null;    // AI 브리핑에서 매칭된 출처 표시 제목
  matchedUrl: string | null;      // AI 브리핑 인용 근거 URL(스펙 #8/#19)
  hasAiTab: boolean;              // AI 탭 콘텐츠 생성 여부
  tabExposed: boolean;            // AI 탭 출처에 내 게시글 포함 여부
  tabSourceIndex: number | null;  // AI 탭 출처 순번
  tabSourceTotal: number | null;  // AI 탭 출처 총 개수
  tabMatchedTitle: string | null; // AI 탭에서 매칭된 출처 표시 제목
  tabMatchedUrl: string | null;   // AI 탭 인용 근거 URL(스펙 #8/#19)
  error?: string;
}

const EMPTY_RESULT: Omit<AiBriefingCheckResult, 'error'> = {
  hasAiBriefing: false, exposed: false, sourceIndex: null, sourceTotal: null, matchedTitle: null, matchedUrl: null,
  hasAiTab: false, tabExposed: false, tabSourceIndex: null, tabSourceTotal: null, tabMatchedTitle: null, tabMatchedUrl: null,
};

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

/**
 * 브라우저 컨텍스트 안에서 MutationObserver로 DOM 변경을 직접 감시해, 마지막 변경 이후
 * `debounceMs` 동안 추가 변경이 없으면 즉시 resolve한다(Node↔브라우저 폴링 왕복 없음).
 * `scopeSelector`가 있으면 그 selector에 매칭되는 노드들만 관찰(위젯 전용), 없으면 document.body 전체.
 * 아무리 안정화되지 않아도 `maxWaitMs` 후에는 안전장치로 resolve.
 */
async function waitForContentStable(page: Page, scopeSelector: string | null, debounceMs: number, maxWaitMs: number): Promise<void> {
  await page.evaluate((scopeSelector, debounceMs, maxWaitMs) => {
    return new Promise<void>(resolve => {
      const targets = scopeSelector
        ? Array.from(document.querySelectorAll(scopeSelector))
        : [document.body];
      if (targets.length === 0) { resolve(); return; }

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;
      const observer = new MutationObserver(schedule);
      let settled = false;

      function settle() {
        if (settled) return;
        settled = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        if (maxTimer) clearTimeout(maxTimer);
        observer.disconnect();
        resolve();
      }
      function schedule() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(settle, debounceMs);
      }

      for (const t of targets) {
        observer.observe(t, { childList: true, subtree: true, characterData: true });
      }
      schedule(); // 관찰 시작 시점부터 이미 조용하면 debounceMs 후 바로 안정 판정
      maxTimer = setTimeout(settle, maxWaitMs);
    });
  }, scopeSelector, debounceMs, maxWaitMs);
}

/**
 * AI 탭 답변 생성이 실제로 끝날 때까지 기다린다("중지" 버튼 등장→소멸 기준).
 * 버튼이 아예 나타나지 않으면(이미 생성이 끝났거나 UI가 다른 경우) 조용히 통과 —
 * 이 경우엔 뒤이은 `waitForContentStable`이 최종 안전장치 역할을 한다.
 */
async function waitForGenerationToFinish(page: Page): Promise<boolean> {
  const appeared = await page.waitForSelector(STOP_BUTTON_SELECTOR, { timeout: STOP_BUTTON_APPEAR_TIMEOUT_MS })
    .then(() => true).catch(() => false);
  if (!appeared) return false; // 신호를 못 찾음 — 호출부에서 기존 긴 debounce로 폴백
  return page.waitForSelector(STOP_BUTTON_SELECTOR, { hidden: true, timeout: STOP_BUTTON_DISAPPEAR_TIMEOUT_MS })
    .then(() => true).catch(() => false);
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
  if (!has) return { ...EMPTY_SURFACE };
  const match = findMatch(evalResult.sources, blogId, postId);
  return {
    has: true,
    exposed: !!match,
    sourceIndex: match?.index ?? null,
    sourceTotal: evalResult.sources.length || null,
    matchedTitle: match?.source.title || null,
    matchedUrl: match?.source.url || null,
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

// 서버리스 컨테이너가 warm 상태로 재사용될 때 Chromium 프로세스 자체를 재사용해 기동 비용을 절감.
// 페이지(탭)는 매 요청마다 새로 열고 닫는다 — 브라우저 프로세스만 공유.
let cachedBrowserPromise: Promise<Browser> | null = null;

async function getBrowser(forceNew = false): Promise<Browser> {
  if (!forceNew && cachedBrowserPromise) {
    try {
      const browser = await cachedBrowserPromise;
      if (browser.isConnected()) return browser;
    } catch {
      // 캐시된 launch 자체가 실패한 경우 — 아래에서 새로 재시도
    }
  }
  cachedBrowserPromise = launchBrowser();
  return cachedBrowserPromise;
}

/** Puppeteer/Chromium 프로세스 자체가 죽어서 발생하는 에러인지 판별 — 이 경우만 캐시 무효화 후 재시도 */
function isBrowserDeadError(message: string): boolean {
  return /Protocol error|Target closed|Session closed|Connection closed|WebSocket is (not open|closed)/i.test(message);
}

/**
 * 일반 통합검색 결과 페이지(이미 로드되어 있음)에서 "AI 브리핑" 인라인 위젯을 확인한다.
 * 위젯이 렌더링되면 "펼쳐서 더보기" 버튼을 클릭해 전체 콘텐츠 + 출처 목록을 펼친 뒤 평가한다.
 */
async function checkBriefingWidget(page: Page, blogId: string, postId: string): Promise<SurfaceResult & { blocked: boolean }> {
  const appeared = await page.waitForSelector(WIDGET_SELECTOR, { timeout: MAX_WIDGET_WAIT_MS })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    // 위젯 자체가 렌더링되지 않음 — 이 키워드는 AI 브리핑이 노출되지 않는 것으로 간주
    return { ...EMPTY_SURFACE, blocked: false };
  }

  // 콘텐츠가 안정될 때까지 대기(비동기 스트리밍/렌더링 완료 대기, MutationObserver 기반)
  await waitForContentStable(page, WIDGET_SELECTOR, STABLE_DEBOUNCE_MS, MAX_STREAM_WAIT_MS);

  // "펼쳐서 더보기" 버튼이 있으면 클릭해 전체 콘텐츠/출처를 펼친다
  const clicked = await page.evaluate((selector, expandText) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    const btn = nodes.find(el => (el.textContent || '').includes(expandText)) as HTMLElement | undefined;
    if (btn) { btn.click(); return true; }
    return false;
  }, WIDGET_SELECTOR, WIDGET_EXPAND_BUTTON_TEXT).catch(() => false);

  if (clicked) {
    // 펼침 애니메이션/추가 렌더링이 끝날 때까지만 짧게 대기(고정 3초 대신 동적 감지)
    await waitForContentStable(page, WIDGET_SELECTOR, EXPAND_DEBOUNCE_MS, EXPAND_MAX_WAIT_MS);
  }

  const evalResult = await page.evaluate(
    evaluateWidget, WIDGET_SELECTOR, SOURCE_SELECTORS, BLOCKED_TEXT_MARKER, BRIEFING_LABEL_MARKER,
  ) as SurfaceEvalResult;

  if (evalResult.blocked) {
    return { ...EMPTY_SURFACE, blocked: true };
  }

  return { ...toSurfaceResult(evalResult, blogId, postId), blocked: false };
}

/** 이미 로드된 검색 결과 페이지 안에서 실제 "AI" 탭 앵커를 찾아 클릭(in-page navigation)해 진입한다. */
async function enterAiTab(page: Page): Promise<boolean> {
  const hasAiTabLink = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all'));
  }).catch(() => false);
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
async function checkAiTab(page: Page, blogId: string, postId: string): Promise<SurfaceResult & { blocked: boolean }> {
  const entered = await enterAiTab(page);
  if (!entered) {
    return { ...EMPTY_SURFACE, blocked: false };
  }

  // 1차: "중지" 버튼 등장→소멸로 실제 스트리밍 종료를 판정(가장 신뢰도 높은 신호).
  const confirmedFinished = await waitForGenerationToFinish(page);
  // 2차: confirmedFinished면 후처리 렌더링만 짧게 확인, 신호를 못 찾았으면 기존 긴 debounce로 폴백.
  await waitForContentStable(
    page,
    null,
    confirmedFinished ? EXPAND_DEBOUNCE_MS : STABLE_DEBOUNCE_MS,
    confirmedFinished ? EXPAND_MAX_WAIT_MS : MAX_STREAM_WAIT_MS,
  );

  const evalResult = await page.evaluate(
    evaluateWholeDocument, SOURCE_SELECTORS, BLOCKED_TEXT_MARKER, BRIEFING_LABEL_MARKER,
  ) as SurfaceEvalResult;

  if (evalResult.blocked) {
    return { ...EMPTY_SURFACE, blocked: true };
  }

  return { ...toSurfaceResult(evalResult, blogId, postId), blocked: false };
}

/**
 * ── AI 인용 확인 Provider 경계(스펙 #13, 정직성) ──────────────────────────────
 * 네이버는 "AI 브리핑"·"AI 탭" **인용 결과를 조회하는 공식 API를 제공하지 않는다**
 * (NAVER Developers / API HUB 어디에도 없음 — 2026-08 확인). 공식 검색 OpenAPI
 * (openapi.naver.com/v1/search/*)는 일반 검색결과일 뿐 AI 인용과 무관하므로, 이를 AI 인용으로
 * 간주하지 않는다(스펙 #6). 따라서 유일한 확인 수단은 아래 헤드리스 브라우저 실측 구현이다.
 *
 * 향후 공식 API(또는 API HUB)가 생기면 이 인터페이스만 새 구현으로 교체하면 되고, 호출측
 * (check-ai-briefing route 등)은 그대로 둔다 — 검색 API 쪽 provider 추상화(naver-blog-search-api.ts)와 동일 패턴.
 * ⚠️ 가짜/목업 데이터로 이 인터페이스를 구현하지 않는다(스펙 #13). 확인 불가는 error로 정직하게 반환한다.
 */
export interface NaverAiCitationProvider {
  /** 공식 API 미제공. 'headless-scrape'가 현재 유일한 실측 구현임을 코드로 드러낸다. */
  readonly kind: 'headless-scrape';
  check(
    keyword: string,
    blogId: string,
    postId: string,
    onStage?: (stage: AiBriefingStage) => void,
  ): Promise<AiBriefingCheckResult>;
}

/** 현재 활성 provider — 공식 API 이관 시 이 구현만 교체. */
export const naverAiCitationProvider: NaverAiCitationProvider = {
  kind: 'headless-scrape',
  check: (keyword, blogId, postId, onStage) => checkAiBriefingExposure(keyword, blogId, postId, onStage),
};

/**
 * keyword로 (1) 통합검색 "AI 브리핑" 인라인 위젯과 (2) "AI" 탭을 각각 독립적으로 확인해
 * 콘텐츠 생성 여부 + 내 포스팅의 인용 여부(blogId+logNo 기준)를 반환한다.
 * `onStage` 콜백으로 진행 단계(searching→briefing→tab→comparing)를 실시간 전달할 수 있다.
 * ⚠️ 이용약관/서버 부하/자동화 탐지 리스크 때문에 배치 실행은 지원하지 않는다 — 반드시
 * 사용자가 선택한 포스팅 1건에 대해서만, 온디맨드로 단건 호출한다 (naver-mate 페이지 참고).
 */
export async function checkAiBriefingExposure(
  keyword: string,
  blogId: string,
  postId: string,
  onStage?: (stage: AiBriefingStage) => void,
): Promise<AiBriefingCheckResult> {
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (e) {
    return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : String(e) };
  }

  const result = await checkOne(browser, keyword, blogId, postId, onStage);

  // 브라우저 프로세스 자체가 죽어서 실패한 경우 — 캐시를 무효화하고 한 번만 새로 띄워 재시도
  if (result.error && isBrowserDeadError(result.error)) {
    cachedBrowserPromise = null;
    try {
      const freshBrowser = await getBrowser(true);
      return await checkOne(freshBrowser, keyword, blogId, postId, onStage);
    } catch (e) {
      return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return result;
}

async function checkOne(
  browser: Browser,
  keyword: string,
  blogId: string,
  postId: string,
  onStage?: (stage: AiBriefingStage) => void,
): Promise<AiBriefingCheckResult> {
  const BLOCKED_ERROR = '네이버 접근이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.';

  const overallStart = Date.now();
  let lastMark = overallStart;
  const timings: Record<string, number> = {};
  const lap = (label: string) => {
    const now = Date.now();
    timings[label] = now - lastMark;
    lastMark = now;
  };

  let page: Page | undefined;
  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });

    // 판정과 무관한 리소스(이미지/폰트/미디어) 차단 — 로딩 시간 단축, 텍스트/링크 판정엔 영향 없음
    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
    lap('setup');

    onStage?.('searching');
    const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    lap('search');

    const blockedEarly = await page.evaluate(marker => (document.body.innerText || '').includes(marker), BLOCKED_TEXT_MARKER).catch(() => false);
    if (blockedEarly) {
      return { ...EMPTY_RESULT, error: BLOCKED_ERROR };
    }

    // 1) AI 브리핑(통합검색 인라인 위젯) — 독립적으로 확인 (같은 페이지, 추가 이동 없음)
    onStage?.('briefing');
    const briefing = await checkBriefingWidget(page, blogId, postId);
    lap('briefing');
    if (briefing.blocked) {
      return { ...EMPTY_RESULT, error: BLOCKED_ERROR };
    }

    // 2) AI 탭 — 같은 페이지에서 탭 앵커 클릭으로 진입(별도 재검색 없음), 위젯 결과와 서로 영향 없음
    onStage?.('tab');
    const tab = await checkAiTab(page, blogId, postId);
    lap('tab');
    if (tab.blocked) {
      // 브리핑은 정상 확인됐지만 탭 확인 중 차단된 경우 — 절반의 결과라도 "없음"으로
      // 단정하지 않도록 에러로 반환한다(캐시되지 않아 다음 시도가 바로 재확인 가능).
      return { ...EMPTY_RESULT, error: BLOCKED_ERROR };
    }

    onStage?.('comparing');
    const result: AiBriefingCheckResult = {
      hasAiBriefing: briefing.has,
      exposed: briefing.exposed,
      sourceIndex: briefing.sourceIndex,
      sourceTotal: briefing.sourceTotal,
      matchedTitle: briefing.matchedTitle,
      matchedUrl: briefing.matchedUrl,
      hasAiTab: tab.has,
      tabExposed: tab.exposed,
      tabSourceIndex: tab.sourceIndex,
      tabSourceTotal: tab.sourceTotal,
      tabMatchedTitle: tab.matchedTitle,
      tabMatchedUrl: tab.matchedUrl,
    };
    lap('compare');
    return result;
  } catch (e) {
    return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : String(e) };
  } finally {
    const totalMs = Date.now() - overallStart;
    const breakdown = Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(' ');
    console.log(`[ai-briefing][timing] keyword="${keyword}" ${breakdown} total=${totalMs}ms`);
    await page?.close().catch(() => {});
  }
}
