import puppeteer, { type Browser, type Page, type HTTPRequest, type HTTPResponse } from 'puppeteer-core';
import { parseBlogPostRef, matchesPost } from '@/lib/naver-blog-post-ref';

/**
 * 네이버 "AI 브리핑"(통합검색 인라인 위젯) + "AI 탭"(ssc=tab.ait.all) 인용 여부 확인
 * — 'AI 브리핑 · AI 탭' 기능(구 네이버메이트)의 핵심 엔진.
 *
 * ── 판정 원칙 (2026-08-22 전면 재작성) ─────────────────────────────────────
 * **확인하지 못한 것은 미인용이 아니다.** 이전 구현은 확인 실패(위젯 렌더 지연, 탭 진입 실패,
 * DOM 구조 변경, 스트리밍 미완료)를 전부 `exposed=false`(미인용)로 흘려보냈다. 이제 각 표면은
 * boolean 이 아니라 5개 상태 중 하나를 반환한다:
 *
 *   CITED       — 출처 목록에서 내 글(blogId+logNo)을 실제로 찾음
 *   NOT_CITED   — 화면·출처 목록을 정상적으로 다 확인했고 내 글이 없음(= 진짜 미인용)
 *   UNVERIFIED  — 확인 절차가 끝까지 진행되지 못함(렌더/스트리밍 미완료, 출처 0건 등). 재시도 대상
 *   UNAVAILABLE — 네이버 쪽 사정으로 확인 불가(접근 차단, CAPTCHA, HTTP 오류, DOM 구조 변경)
 *   ERROR       — 우리 쪽 실행 오류(브라우저 죽음, 네트워크 예외)
 *
 * NOT_CITED 는 아래를 **전부** 통과했을 때만 나온다:
 *   검색 페이지 정상 응답(HTTP 2xx) → 차단/CAPTCHA 아님 → 페이지 골격(#main_pack) 정상 →
 *   해당 AI 영역 로딩 완료 → 출처 목록 확보(1건 이상) → 그 목록에 내 글 없음
 * 단 하나의 예외: 해당 키워드에 AI 영역 자체가 제공되지 않는 경우(present=false)는
 * "인용될 자리가 없음"이 화면으로 확인된 것이므로 NOT_CITED 로 본다(UI 라벨은 '브리핑 없음').
 *
 * ── 두 표면은 완전히 독립 ────────────────────────────────────────────────
 * AI 브리핑과 AI 탭은 서로 다른 서비스이고 출처 큐레이션도 다르다(2026-07-04 오렌지 실측 제보).
 * 어느 한쪽이 실패해도 다른 쪽의 성공 결과를 버리지 않는다 —
 * "브리핑 CITED + 탭 UNAVAILABLE" 같은 조합이 그대로 반환·저장된다.
 *
 * ── 실측으로 확인된 DOM 사실 (2026-08-22, scripts/probe-ai-citation-*.mjs) ──
 * 1) AI 브리핑 위젯의 내부 클래스는 여전히 `fds-aib-*` 접두사다. 출처는
 *    `fds-aib-multi-source-scroll-area` 안에 **처음부터 전부 DOM 에 존재**한다("+N" 칩은 시각 효과).
 * 2) 위젯이 없는 키워드도 진입 직후 `fds-aib-connected fds-aib-collapsed` 빈 껍데기가 잠깐
 *    나타났다가 500ms 안에 사라진다. 따라서 `waitForSelector('[class*="fds-aib"]')` 는
 *    **껍데기에도 즉시 resolve** 되므로 위젯 존재 판정에 쓰면 안 된다 → 본문 텍스트가 실린
 *    위젯이 나타날 때까지 `waitForFunction` 으로 기다린다.
 * 3) AI 탭의 출처는 반대로 **"+N" 칩을 눌러야 DOM 에 추가**된다. 실측: '강아지 슬개골 탈구'에서
 *    클릭 전 blog.naver.com 링크 1건 → 클릭 후 3건. 즉 이전 구현은 인용된 글 3개 중 2개를
 *    보지 못하고 "미인용"으로 판정하고 있었다(이번 수정의 핵심 사유).
 * 4) AI 탭 답변·출처는 `fds-ai-tab-conversation-item` 컨테이너 안에 있다. 문서 전체에서 링크를
 *    긁으면 상단 네비/도움말 링크까지 섞이므로 이 컨테이너로 스코프한다.
 * 5) 위젯의 '펼쳐서 더보기'는 `<button>` 이다. 이전 구현은 `textContent` 로 찾는 바람에
 *    자손 텍스트를 포함하는 최상위 `div.fds-aib-expandable-container` 를 클릭하고 있었다(무동작).
 *    엉뚱한 노드를 클릭하면 위젯이 통째로 사라지는 것도 실측됐다 — 반드시 정확히 버튼만 누른다.
 * 6) 같은 키워드를 몇 분 간격으로 두 번 확인하면 AI 탭 답변과 출처 구성이 달라진다(생성형이므로
 *    비결정적). 한 번의 확인은 "그 시점의 표본"이며, 인용 여부는 시점에 따라 바뀔 수 있다.
 *
 * ⚠️ `ssc=tab.ait.all` URL 로 직접 goto 하면 "잘못된 접근입니다"로 거부된다. 반드시 통합검색
 *    페이지에 먼저 들어간 뒤 페이지 안의 AI 탭 앵커를 클릭해야 한다(referrer/세션 검증 추정).
 * ⚠️ 짧은 시간에 반복 요청하면 네이버가 차단한다 — 배치는 ai-citation-batch.ts 의 캡·지연을 따른다.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 25_000;

// 콘텐츠 안정화 대기 — MutationObserver 가 마지막 변경 이후 이 시간(ms) 동안 조용하면 렌더 종료로 간주.
const STABLE_DEBOUNCE_MS = 900;
const MAX_STREAM_WAIT_MS = 35_000;

// 펼침/오버레이 클릭 직후의 추가 렌더는 보통 즉시 끝나므로 더 짧은 debounce/상한 사용
const EXPAND_DEBOUNCE_MS = 500;
const EXPAND_MAX_WAIT_MS = 4_000;

// AI 브리핑 위젯은 통합검색 진입 후 비동기로 늦게 렌더링된다 — "본문이 실린" 위젯을 기다리는 상한
const MAX_WIDGET_WAIT_MS = 20_000;

// 위젯/탭 답변이 "실제로 생성됐다"고 볼 최소 본문 길이(빈 껍데기·스켈레톤과 구분)
const MIN_SURFACE_TEXT_LENGTH = 100;

// AI 탭 답변 생성 중에만 보이는 중지 버튼 — 등장→소멸이 스트리밍 종료의 가장 신뢰도 높은 신호.
const STOP_BUTTON_SELECTOR = 'button[aria-label="중지"]';
const STOP_BUTTON_APPEAR_TIMEOUT_MS = 8_000;
const STOP_BUTTON_DISAPPEAR_TIMEOUT_MS = 45_000;

const WIDGET_SELECTOR = '[class*="fds-aib"]';
const WIDGET_SOURCE_AREA_SELECTOR = '[class*="fds-aib-multi-source"]';
const TAB_CONVERSATION_SELECTOR = '[class*="fds-ai-tab-conversation-item"]';
const WIDGET_EXPAND_BUTTON_TEXT = '펼쳐서 더보기';

// 통합검색 페이지 골격 — 이게 없으면 "검색 결과가 정상 로딩됐다"고 말할 수 없다.
const SEARCH_PAGE_HEALTH_SELECTOR = '#main_pack';
// 탭 목록(AI 탭 앵커의 부모) — 앵커가 없을 때 "이 키워드에 AI 탭이 없다"와
// "탭 UI 자체를 못 읽었다"를 구분하기 위한 기준.
const SEARCH_TAB_BAR_SELECTOR = '.api_flicking_wrap, [role="tablist"], .sub_nav';

// 네이버가 자동화를 막을 때 노출하는 문구들(실측 + 방어적 추가)
const BLOCK_MARKERS = ['잘못된 접근입니다', '비정상적인 접근', '접근이 제한'];
const CAPTCHA_MARKERS = ['자동입력 방지', '보안문자', '보안 문자', '캡차'];
const MAINTENANCE_MARKERS = ['서비스 점검', '일시적인 오류가 발생', '일시적으로 서비스'];

// 출처로 세지 않는 호스트(전역 네비게이션·도움말·유틸리티 링크)
const NON_SOURCE_HOSTS = [
  'www.naver.com', 'naver.com', 'search.naver.com', 'm.search.naver.com',
  'help.naver.com', 'nid.naver.com', 'dict.naver.com', 'map.naver.com',
  'search.shopping.naver.com',
];

// 판정(텍스트/링크)과 무관한 리소스만 차단. 'stylesheet' 는 제외 —
// innerText 는 CSS 렌더링 결과에 의존하므로 차단 시 오탐 위험이 있다.
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

export type AiBriefingStage = 'searching' | 'briefing' | 'tab' | 'comparing';

/** 표면(AI 브리핑 / AI 탭) 하나에 대한 확인 결과 상태. boolean 로 뭉개지 않는다. */
export type SurfaceStatus = 'CITED' | 'NOT_CITED' | 'UNVERIFIED' | 'UNAVAILABLE' | 'ERROR';

export type SurfaceErrorCode =
  | 'HTTP_ERROR'         // 검색 페이지가 4xx/5xx
  | 'BLOCKED'            // 네이버 자동화 차단 문구
  | 'CAPTCHA'            // 보안문자 요구
  | 'MAINTENANCE'        // 점검/일시 오류 안내
  | 'PAGE_UNHEALTHY'     // 검색 결과 골격(#main_pack) 자체가 없음
  | 'RENDER_TIMEOUT'     // 영역이 뜨는 중이었으나 시간 안에 본문이 채워지지 않음
  | 'STREAM_TIMEOUT'     // AI 탭 답변 생성이 상한 시간 내에 끝나지 않음
  | 'DOM_CHANGED'        // 기대하는 컨테이너가 없음(네이버 마크업 변경 의심)
  | 'TAB_ENTRY_FAILED'   // AI 탭 진입(클릭 네비게이션) 실패
  | 'NO_SOURCES'         // 답변은 있는데 출처 목록을 하나도 확보하지 못함
  | 'NAV_TIMEOUT'        // 페이지 이동 타임아웃
  | 'BROWSER_ERROR'      // Puppeteer/Chromium 실행 오류
  | 'NETWORK_ERROR';     // 네트워크 예외

export interface SurfaceOutcome {
  status: SurfaceStatus;
  /** 해당 AI 영역이 화면에 존재/생성되었는지. 확인하지 못했으면 null. */
  present: boolean | null;
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
  matchedUrl: string | null;
  errorCode: SurfaceErrorCode | null;
  errorMessage: string | null;
}

interface RawSource {
  url: string;
  title: string;
}

interface SurfaceEvalResult {
  textLength: number;
  nodeCount: number;
  sources: RawSource[];
}

function surface(
  status: SurfaceStatus,
  patch: Partial<SurfaceOutcome> = {},
): SurfaceOutcome {
  return {
    status,
    present: null,
    sourceIndex: null,
    sourceTotal: null,
    matchedTitle: null,
    matchedUrl: null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

export interface AiBriefingCheckResult {
  /** AI 브리핑(통합검색 인라인 위젯) 확인 결과 — AI 탭과 완전히 독립 */
  briefing: SurfaceOutcome;
  /** AI 탭(ssc=tab.ait.all) 확인 결과 — AI 브리핑과 완전히 독립 */
  tab: SurfaceOutcome;
  checkedAt: string;
  query: string;
  targetBlogId: string;
  targetPostId: string;
  source: 'naver_headless_scrape';

  // ── 레거시 평면 필드(기존 저장/화면 호환) ──────────────────────────────
  // ⚠️ 확인에 성공한 경우(CITED/NOT_CITED)에만 boolean 이 들어가고, 그 외에는 null 이다.
  //    null 을 false 로 강등해 읽으면 안 된다 — 그게 정확히 이번에 고친 버그다.
  hasAiBriefing: boolean | null;
  exposed: boolean | null;
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
  matchedUrl: string | null;
  hasAiTab: boolean | null;
  tabExposed: boolean | null;
  tabSourceIndex: number | null;
  tabSourceTotal: number | null;
  tabMatchedTitle: string | null;
  tabMatchedUrl: string | null;

  /** 두 표면 모두 확인 자체가 불가능했던 전역 실패(브라우저 죽음 등)일 때만 채워진다. */
  error?: string;
}

/** 확인이 끝까지 진행돼 "인용/미인용"을 단정할 수 있는 상태인지 */
export function isVerifiedStatus(s: SurfaceStatus): boolean {
  return s === 'CITED' || s === 'NOT_CITED';
}

function exposedFromStatus(s: SurfaceStatus): boolean | null {
  if (s === 'CITED') return true;
  if (s === 'NOT_CITED') return false;
  return null;
}

/**
 * 네이버 블로그 URL에서 {blogId, postId} 추출.
 * 표기 환원은 §3.2 정준화 모듈(naver-blog-post-ref)에 위임한다 — 출처 URL을 못 읽으면
 * 실제로 인용된 글이 '미인용'으로 판정되므로, 인용 판정과 순위 판정이 같은 표기 목록을 읽어야 한다.
 */
export function extractBlogPost(url: string): { blogId: string; postId: string } | null {
  const ref = parseBlogPostRef(url);
  return ref ? { blogId: ref.blogId, postId: ref.logNo } : null;
}

/**
 * blogId(대소문자 무관) + logNo(postId) **둘 다** 일치하는 출처만 인용으로 인정한다.
 * 제목 부분 일치나 URL 문자열 포함으로 판정하지 않는다 — 같은 블로그의 다른 글,
 * 제목이 비슷한 남의 글이 인용된 경우를 인용으로 오판하지 않기 위함(스펙 #11).
 */
export function findMatch(sources: RawSource[], blogId: string, postId: string): { index: number; source: RawSource } | null {
  for (let i = 0; i < sources.length; i++) {
    if (matchesPost(sources[i].url, blogId, postId)) {
      return { index: i + 1, source: sources[i] };
    }
  }
  return null;
}

/**
 * 출처 목록까지 확보한 표면의 최종 판정.
 * 출처가 0건이면 "미인용"이라고 말할 근거가 없으므로 UNVERIFIED(NO_SOURCES) 로 되돌린다.
 */
function judge(evalResult: SurfaceEvalResult, blogId: string, postId: string): SurfaceOutcome {
  if (evalResult.sources.length === 0) {
    return surface('UNVERIFIED', {
      present: true,
      errorCode: 'NO_SOURCES',
      errorMessage: '답변은 생성됐으나 출처 목록을 확보하지 못해 인용 여부를 판정할 수 없습니다.',
    });
  }
  const match = findMatch(evalResult.sources, blogId, postId);
  return surface(match ? 'CITED' : 'NOT_CITED', {
    present: true,
    sourceIndex: match?.index ?? null,
    sourceTotal: evalResult.sources.length,
    matchedTitle: match?.source.title || null,
    matchedUrl: match?.source.url || null,
  });
}

/**
 * Vercel(서버리스)에서는 @sparticuz/chromium 바이너리를, 로컬 개발에서는 시스템 Chrome을 사용한다.
 */
async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // Vercel 의 Node 함수는 Lambda 위에서 돌지만 @sparticuz/chromium 이 환경 감지에 쓰는
    // AWS_EXECUTION_ENV/AWS_LAMBDA_JS_RUNTIME 을 노출하지 않아, 공유 라이브러리(libnss3.so 등)를
    // 추출하지 않고 실행이 실패한다. import 전에 신호를 주입해 추출을 강제한다.
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

// warm 컨테이너에서 Chromium 프로세스를 재사용(페이지는 매 요청마다 새로 열고 닫는다).
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
 * 브라우저 컨텍스트에서 MutationObserver 로 DOM 변경을 감시해, 마지막 변경 이후 `debounceMs`
 * 동안 조용하면 resolve. `scopeSelector` 가 있으면 그 노드들만 관찰한다.
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
      schedule();
      maxTimer = setTimeout(settle, maxWaitMs);
    });
  }, scopeSelector, debounceMs, maxWaitMs).catch(() => {});
}

/** 페이지 본문에서 차단/CAPTCHA/점검 문구를 감지한다. */
async function detectObstruction(page: Page): Promise<{ code: SurfaceErrorCode; message: string } | null> {
  const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  if (!text) return null;
  const hit = (markers: string[]) => markers.some(m => text.includes(m));
  if (hit(CAPTCHA_MARKERS)) {
    return { code: 'CAPTCHA', message: '네이버가 보안문자(CAPTCHA) 확인을 요구해 자동 확인을 진행할 수 없습니다.' };
  }
  if (hit(BLOCK_MARKERS)) {
    return { code: 'BLOCKED', message: '네이버 접근이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.' };
  }
  if (hit(MAINTENANCE_MARKERS)) {
    return { code: 'MAINTENANCE', message: '네이버 서비스가 일시적으로 응답하지 않아 확인하지 못했습니다.' };
  }
  return null;
}

/**
 * 표면 스코프 안의 텍스트/출처 링크를 수집한다.
 * - 절대 URL(http/https)만 출처로 인정 — 위젯의 '관련 질문'은 상대경로(`?where=nexearch...`)라 자동 제외된다.
 * - 전역 네비게이션·도움말 호스트는 출처에서 제외한다.
 */
async function evaluateSurface(page: Page, scopeSelector: string, nonSourceHosts: string[]): Promise<SurfaceEvalResult> {
  return page.evaluate((scopeSelector, nonSourceHosts) => {
    const nodes = Array.from(document.querySelectorAll(scopeSelector));
    if (nodes.length === 0) return { textLength: 0, nodeCount: 0, sources: [] };

    // 중첩 노드의 텍스트가 중복 계산되지 않도록 최상위 노드만 텍스트 집계에 쓴다.
    const roots = nodes.filter(n => !n.parentElement?.closest(scopeSelector));
    let text = '';
    for (const n of roots) text += (n as HTMLElement).innerText || n.textContent || '';

    const seen = new Set<string>();
    const sources: { url: string; title: string }[] = [];
    for (const node of nodes) {
      node.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) return; // 상대경로(관련 질문 등)는 출처 아님
        let host = '';
        try { host = new URL(href).hostname.toLowerCase(); } catch { return; }
        if (nonSourceHosts.includes(host)) return;
        if (seen.has(href)) return;
        seen.add(href);
        sources.push({ url: href, title: (link.textContent || '').trim() });
      });
    }
    return { textLength: text.length, nodeCount: nodes.length, sources };
  }, scopeSelector, nonSourceHosts) as Promise<SurfaceEvalResult>;
}

/**
 * 접혀 있는 출처 목록을 펼친다. AI 탭은 "+N" 칩을 눌러야 나머지 출처가 DOM 에 추가되므로
 * 이 단계를 건너뛰면 인용된 글을 못 보고 미인용으로 오판한다(실측 확인).
 * 엉뚱한 노드를 클릭하면 영역이 통째로 사라지므로, 텍스트가 정확히 `+숫자` 인 것만 누른다.
 */
async function expandSourceList(page: Page, scopeSelector: string): Promise<boolean> {
  const clicked = await page.evaluate(scopeSelector => {
    const scope = Array.from(document.querySelectorAll(scopeSelector));
    for (const root of scope) {
      const chip = Array.from(root.querySelectorAll('button,a,[role="button"],span'))
        .find(el => /^\+\d+$/.test((el.textContent || '').trim()));
      if (chip) {
        const target = (chip.closest('button,a,[role="button"]') || chip) as HTMLElement;
        target.click();
        return true;
      }
    }
    return false;
  }, scopeSelector).catch(() => false);

  if (clicked) await waitForContentStable(page, null, EXPAND_DEBOUNCE_MS, EXPAND_MAX_WAIT_MS);
  return clicked;
}

/**
 * ── AI 브리핑(통합검색 인라인 위젯) ────────────────────────────────────────
 * 이미 로드된 통합검색 결과 페이지에서 확인한다. 호출 시점에 페이지 건강성은 검증된 상태.
 */
async function checkBriefingWidget(page: Page, blogId: string, postId: string): Promise<SurfaceOutcome> {
  // 빈 껍데기(fds-aib-connected/collapsed)에 속지 않도록 "본문이 실린" 위젯을 기다린다.
  const hasContentWidget = await page.waitForFunction(
    (selector, minLen) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      if (nodes.length === 0) return false;
      const total = nodes.reduce((s, n) => s + ((n as HTMLElement).innerText || '').length, 0);
      return total >= minLen;
    },
    { timeout: MAX_WIDGET_WAIT_MS, polling: 500 },
    WIDGET_SELECTOR, MIN_SURFACE_TEXT_LENGTH,
  ).then(() => true).catch(() => false);

  if (!hasContentWidget) {
    // 껍데기조차 없으면 "이 키워드엔 AI 브리핑이 제공되지 않는다"가 화면으로 확인된 것.
    // 껍데기가 남아 있으면 렌더가 끝나지 않은 것이므로 미인용으로 단정하지 않는다.
    const skeletonLeft = await page.evaluate(
      selector => document.querySelectorAll(selector).length > 0, WIDGET_SELECTOR,
    ).catch(() => false);
    if (skeletonLeft) {
      return surface('UNVERIFIED', {
        errorCode: 'RENDER_TIMEOUT',
        errorMessage: 'AI 브리핑 영역이 표시되는 중이었으나 제한 시간 안에 내용이 채워지지 않았습니다.',
      });
    }
    return surface('NOT_CITED', { present: false });
  }

  await waitForContentStable(page, WIDGET_SELECTOR, STABLE_DEBOUNCE_MS, MAX_STREAM_WAIT_MS);

  // '펼쳐서 더보기'는 <button> — textContent 로 조상 컨테이너를 잡지 않도록 정확히 버튼만 누른다.
  const expanded = await page.evaluate(expandText => {
    const btn = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find(el => (el.textContent || '').trim() === expandText) as HTMLElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, WIDGET_EXPAND_BUTTON_TEXT).catch(() => false);
  if (expanded) await waitForContentStable(page, WIDGET_SELECTOR, EXPAND_DEBOUNCE_MS, EXPAND_MAX_WAIT_MS);

  // 출처 스크롤 영역의 "+N" 칩(있으면) 펼침 — 브리핑은 대개 이미 DOM 에 다 있지만 방어적으로 시도.
  await expandSourceList(page, WIDGET_SOURCE_AREA_SELECTOR);

  const obstruction = await detectObstruction(page);
  if (obstruction) {
    return surface('UNAVAILABLE', { errorCode: obstruction.code, errorMessage: obstruction.message });
  }

  const evalResult = await evaluateSurface(page, WIDGET_SELECTOR, NON_SOURCE_HOSTS);
  if (evalResult.nodeCount === 0) {
    // 확인 도중 위젯이 사라짐(재렌더/네비게이션) — 미인용으로 단정하지 않는다.
    return surface('UNVERIFIED', {
      errorCode: 'DOM_CHANGED',
      errorMessage: '확인 도중 AI 브리핑 영역이 사라져 판정하지 못했습니다.',
    });
  }
  return judge(evalResult, blogId, postId);
}

/**
 * 이미 로드된 검색 결과 페이지에서 실제 "AI" 탭 앵커를 클릭해 진입한다.
 * 반환값으로 "앵커가 없었다(=이 키워드엔 AI 탭 없음)"와 "진입에 실패했다"를 구분한다.
 */
async function enterAiTab(page: Page): Promise<'entered' | 'no-anchor' | 'entry-failed' | 'no-tabbar'> {
  const probe = await page.evaluate(tabBarSelector => ({
    hasAnchor: !!Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('ssc=tab.ait.all')),
    hasTabBar: !!document.querySelector(tabBarSelector),
  }), SEARCH_TAB_BAR_SELECTOR).catch(() => null);

  if (!probe) return 'entry-failed';
  if (!probe.hasAnchor) return probe.hasTabBar ? 'no-anchor' : 'no-tabbar';

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null),
    page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => (el.getAttribute('href') || '').includes('ssc=tab.ait.all'));
      if (a) (a as HTMLElement).click();
    }).catch(() => {}),
  ]);

  return page.url().includes('ssc=tab.ait.all') ? 'entered' : 'entry-failed';
}

/** AI 탭 답변 생성이 끝날 때까지 대기 — 중지 버튼 등장→소멸을 1차 신호로 쓴다. */
async function waitForGenerationToFinish(page: Page): Promise<'finished' | 'not-seen' | 'timeout'> {
  const appeared = await page.waitForSelector(STOP_BUTTON_SELECTOR, { timeout: STOP_BUTTON_APPEAR_TIMEOUT_MS })
    .then(() => true).catch(() => false);
  if (!appeared) return 'not-seen';
  const gone = await page.waitForSelector(STOP_BUTTON_SELECTOR, { hidden: true, timeout: STOP_BUTTON_DISAPPEAR_TIMEOUT_MS })
    .then(() => true).catch(() => false);
  return gone ? 'finished' : 'timeout';
}

/** ── AI 탭(ssc=tab.ait.all) ─────────────────────────────────────────────── */
async function checkAiTab(page: Page, blogId: string, postId: string): Promise<SurfaceOutcome> {
  const entry = await enterAiTab(page);
  if (entry === 'no-anchor') {
    // 탭 바는 정상인데 AI 탭이 없음 = 이 키워드에 AI 탭이 제공되지 않음(화면으로 확인됨).
    return surface('NOT_CITED', { present: false });
  }
  if (entry === 'no-tabbar') {
    return surface('UNAVAILABLE', {
      errorCode: 'DOM_CHANGED',
      errorMessage: '검색 결과의 탭 목록을 읽지 못해 AI 탭 제공 여부를 확인할 수 없습니다.',
    });
  }
  if (entry === 'entry-failed') {
    return surface('UNAVAILABLE', {
      errorCode: 'TAB_ENTRY_FAILED',
      errorMessage: 'AI 탭 진입에 실패해 확인하지 못했습니다.',
    });
  }

  const generation = await waitForGenerationToFinish(page);
  await waitForContentStable(
    page,
    null,
    generation === 'finished' ? EXPAND_DEBOUNCE_MS : STABLE_DEBOUNCE_MS,
    generation === 'finished' ? EXPAND_MAX_WAIT_MS : MAX_STREAM_WAIT_MS,
  );

  const obstruction = await detectObstruction(page);
  if (obstruction) {
    return surface('UNAVAILABLE', { errorCode: obstruction.code, errorMessage: obstruction.message });
  }

  if (generation === 'timeout') {
    // 아직 생성 중인 화면을 평가하면 출처가 덜 실린 상태라 미인용으로 오판한다.
    return surface('UNVERIFIED', {
      errorCode: 'STREAM_TIMEOUT',
      errorMessage: 'AI 탭 답변 생성이 제한 시간 안에 끝나지 않아 인용 여부를 판정하지 못했습니다.',
    });
  }

  // 나머지 출처를 DOM 에 실어야 한다 — 이 클릭을 빠뜨리면 인용된 글을 못 본다(실측 확인).
  await expandSourceList(page, TAB_CONVERSATION_SELECTOR);

  const evalResult = await evaluateSurface(page, TAB_CONVERSATION_SELECTOR, NON_SOURCE_HOSTS);
  if (evalResult.nodeCount === 0) {
    return surface('UNAVAILABLE', {
      errorCode: 'DOM_CHANGED',
      errorMessage: 'AI 탭 답변 영역을 찾지 못했습니다(네이버 화면 구조 변경 가능성).',
    });
  }
  if (evalResult.textLength < MIN_SURFACE_TEXT_LENGTH) {
    return surface('UNVERIFIED', {
      errorCode: 'RENDER_TIMEOUT',
      errorMessage: 'AI 탭 답변이 충분히 생성되지 않아 판정하지 못했습니다.',
    });
  }
  return judge(evalResult, blogId, postId);
}

/**
 * ── AI 인용 확인 Provider 경계 ────────────────────────────────────────────
 * 네이버는 AI 브리핑·AI 탭 인용 결과를 조회하는 공식 API를 제공하지 않는다(2026-08 확인).
 * 공식 검색 OpenAPI 는 일반 검색결과일 뿐 AI 인용과 무관하므로 대용으로 쓰지 않는다.
 * 향후 공식 API 가 생기면 이 인터페이스 구현만 교체한다. 가짜/목업 데이터로 구현하지 않는다 —
 * 확인 불가는 UNAVAILABLE/UNVERIFIED 로 정직하게 반환한다.
 */
export interface NaverAiCitationProvider {
  readonly kind: 'headless-scrape';
  check(
    keyword: string,
    blogId: string,
    postId: string,
    onStage?: (stage: AiBriefingStage) => void,
  ): Promise<AiBriefingCheckResult>;
}

export const naverAiCitationProvider: NaverAiCitationProvider = {
  kind: 'headless-scrape',
  check: (keyword, blogId, postId, onStage) => checkAiBriefingExposure(keyword, blogId, postId, onStage),
};

/**
 * keyword 로 (1) 통합검색 "AI 브리핑" 위젯과 (2) "AI" 탭을 각각 독립적으로 확인한다.
 * 어느 한쪽이 실패해도 다른 쪽 결과는 그대로 반환된다.
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
    const msg = e instanceof Error ? e.message : String(e);
    return fatalResult(keyword, blogId, postId, 'BROWSER_ERROR', msg);
  }

  const result = await checkOne(browser, keyword, blogId, postId, onStage);

  // 브라우저 프로세스 자체가 죽어서 실패한 경우 — 캐시를 무효화하고 한 번만 새로 띄워 재시도
  if (result.error && isBrowserDeadError(result.error)) {
    cachedBrowserPromise = null;
    try {
      const freshBrowser = await getBrowser(true);
      return await checkOne(freshBrowser, keyword, blogId, postId, onStage);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fatalResult(keyword, blogId, postId, 'BROWSER_ERROR', msg);
    }
  }

  return result;
}

/** 두 표면 모두 동일한 사유로 확인 불가일 때의 결과(페이지 진입 실패·차단 등) */
function bothSurfaces(
  keyword: string, blogId: string, postId: string,
  briefing: SurfaceOutcome, tab: SurfaceOutcome,
  error?: string,
): AiBriefingCheckResult {
  return {
    briefing,
    tab,
    checkedAt: new Date().toISOString(),
    query: keyword,
    targetBlogId: blogId,
    targetPostId: postId,
    source: 'naver_headless_scrape',
    hasAiBriefing: briefing.present,
    exposed: exposedFromStatus(briefing.status),
    sourceIndex: briefing.sourceIndex,
    sourceTotal: briefing.sourceTotal,
    matchedTitle: briefing.matchedTitle,
    matchedUrl: briefing.matchedUrl,
    hasAiTab: tab.present,
    tabExposed: exposedFromStatus(tab.status),
    tabSourceIndex: tab.sourceIndex,
    tabSourceTotal: tab.sourceTotal,
    tabMatchedTitle: tab.matchedTitle,
    tabMatchedUrl: tab.matchedUrl,
    ...(error ? { error } : {}),
  };
}

function fatalResult(
  keyword: string, blogId: string, postId: string,
  code: SurfaceErrorCode, message: string,
): AiBriefingCheckResult {
  const s = surface('ERROR', { errorCode: code, errorMessage: message });
  return bothSurfaces(keyword, blogId, postId, s, { ...s }, message);
}

async function checkOne(
  browser: Browser,
  keyword: string,
  blogId: string,
  postId: string,
  onStage?: (stage: AiBriefingStage) => void,
): Promise<AiBriefingCheckResult> {
  const overallStart = Date.now();
  let lastMark = overallStart;
  const timings: Record<string, number> = {};
  const lap = (label: string) => {
    const now = Date.now();
    timings[label] = now - lastMark;
    lastMark = now;
  };

  let page: Page | undefined;
  let briefing: SurfaceOutcome = surface('UNVERIFIED');
  let tab: SurfaceOutcome = surface('UNVERIFIED');

  /** 두 표면이 같은 사유로 끝나는 조기 반환 — 로컬 상태도 함께 갱신해 finally 로그가 진실을 남기게 한다. */
  const abortBoth = (s: SurfaceOutcome, error?: string): AiBriefingCheckResult => {
    briefing = s;
    tab = { ...s };
    return bothSurfaces(keyword, blogId, postId, briefing, tab, error);
  };

  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 900 });

    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
    lap('setup');

    onStage?.('searching');
    const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    let response: HTTPResponse | null = null;
    try {
      response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return abortBoth(surface('UNVERIFIED', {
        errorCode: 'NAV_TIMEOUT',
        errorMessage: `검색 페이지를 여는 데 실패했습니다: ${msg}`,
      }));
    }
    lap('search');

    // 1) HTTP 상태 — 4xx/5xx 를 "AI 영역 없음"으로 흘려보내지 않는다.
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return abortBoth(surface('UNAVAILABLE', {
        errorCode: 'HTTP_ERROR',
        errorMessage: `네이버 검색이 HTTP ${status} 로 응답해 확인할 수 없습니다.`,
      }));
    }

    // 2) 차단/CAPTCHA/점검 문구
    const obstruction = await detectObstruction(page);
    if (obstruction) {
      return abortBoth(
        surface('UNAVAILABLE', { errorCode: obstruction.code, errorMessage: obstruction.message }),
        obstruction.message,
      );
    }

    // 3) 검색 결과 골격 — 이게 없으면 아래 판정 전부 무의미하다.
    const healthy = await page.waitForSelector(SEARCH_PAGE_HEALTH_SELECTOR, { timeout: 10_000 })
      .then(() => true).catch(() => false);
    if (!healthy) {
      return abortBoth(surface('UNAVAILABLE', {
        errorCode: 'PAGE_UNHEALTHY',
        errorMessage: '검색 결과 영역을 찾지 못했습니다(네이버 화면 구조 변경 또는 로딩 실패).',
      }));
    }

    // 4) AI 브리핑 — 같은 페이지에서 확인(추가 이동 없음)
    onStage?.('briefing');
    briefing = await checkBriefingWidget(page, blogId, postId);
    lap('briefing');

    // 5) AI 탭 — 같은 페이지에서 탭 앵커 클릭으로 진입.
    //    ⚠️ 탭이 실패해도 위에서 얻은 브리핑 결과는 절대 버리지 않는다(스펙 #2).
    onStage?.('tab');
    tab = await checkAiTab(page, blogId, postId);
    lap('tab');

    onStage?.('comparing');
    lap('compare');
    return bothSurfaces(keyword, blogId, postId, briefing, tab);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const failed = surface('ERROR', { errorCode: 'NETWORK_ERROR', errorMessage: msg });
    // 예외 시점까지 확정된 표면 결과는 유지한다 — 브리핑을 다 확인했는데 탭에서 죽었다면
    // 브리핑 결과는 살린다.
    return bothSurfaces(
      keyword, blogId, postId,
      isVerifiedStatus(briefing.status) ? briefing : failed,
      isVerifiedStatus(tab.status) ? tab : { ...failed },
      msg,
    );
  } finally {
    const totalMs = Date.now() - overallStart;
    const breakdown = Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(' ');
    console.log(
      `[ai-briefing][timing] keyword="${keyword}" ${breakdown} total=${totalMs}ms `
      + `briefing=${briefing.status}${briefing.errorCode ? `(${briefing.errorCode})` : ''} `
      + `tab=${tab.status}${tab.errorCode ? `(${tab.errorCode})` : ''}`,
    );
    await page?.close().catch(() => {});
  }
}
