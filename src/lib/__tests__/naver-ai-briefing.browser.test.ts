/**
 * AI 브리핑 · AI 탭 인용 판정 — 실제 Chrome 브라우저 검증
 * ──────────────────────────────────────────────────────────────────────────
 * 목적: "확인하지 못한 것은 미인용이 아니다"를 **실행으로** 증명한다.
 *
 * 실제 puppeteer Chrome 을 띄우되, 네이버 응답만 고정 픽스처로 바꿔치기해
 * 성공/실패 시나리오를 결정적으로 재현한다(실 네이버는 비결정적이라 실패 케이스를
 * 재현할 수 없다). 엔진 코드는 조금도 바꾸지 않고 그대로 돈다 —
 * DOM 탐색·클릭·MutationObserver 대기·스트리밍 대기 전부 진짜로 수행된다.
 *
 * 실행: npm run test:browser   (기본 `npm test` 에서는 제외됨 — 실 브라우저라 느림)
 */
import { describe, it, expect, afterAll, vi } from 'vitest';

const CHROME = process.env.LOCAL_CHROME_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

type Route = { status?: number; body: string } | 'abort' | null;

const h = vi.hoisted(() => ({
  route: null as null | ((url: string) => Route),
  realBrowser: null as null | { close: () => Promise<void> },
}));

// 실제 Chrome 을 그대로 쓰되, newPage() 로 만든 페이지에 우리 라우터를 **먼저** 물린다.
// 엔진이 나중에 등록하는 핸들러의 continue() 는 "이미 처리됨"으로 throw 되고 엔진이 삼킨다.
vi.mock('puppeteer-core', async importOriginal => {
  const mod = await importOriginal<typeof import('puppeteer-core')>();

  const wrapBrowser = (browser: object) => new Proxy(browser, {
    get(target, prop) {
      if (prop === 'newPage') {
        return async () => {
          const page = await (target as { newPage: () => Promise<never> }).newPage();
          (page as unknown as { on: (e: string, f: (r: never) => void) => void }).on('request', (req: never) => {
            const r = req as unknown as {
              resourceType: () => string; url: () => string;
              abort: (e: string) => Promise<void>;
              respond: (o: object) => Promise<void>;
            };
            if (r.resourceType() !== 'document') return; // 서브리소스는 엔진 핸들러에 맡긴다
            const routed = h.route?.(r.url()) ?? null;
            if (!routed) return;
            if (routed === 'abort') { r.abort('failed').catch(() => {}); return; }
            r.respond({
              status: routed.status ?? 200,
              contentType: 'text/html; charset=utf-8',
              body: routed.body,
            }).catch(() => {});
          });
          return page;
        };
      }
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

  const realDefault = mod.default as unknown as { launch: (o: object) => Promise<object> };
  return {
    ...mod,
    default: new Proxy(realDefault, {
      get(target, prop) {
        if (prop === 'launch') {
          return async (opts: object) => {
            const b = await target.launch.call(target, { ...opts, executablePath: CHROME });
            h.realBrowser = b as unknown as { close: () => Promise<void> };
            return wrapBrowser(b);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }),
  };
});

const { checkAiBriefingExposure } = await import('@/lib/naver-ai-briefing');

// ── 대상 글 ────────────────────────────────────────────────────────────────
const BLOG = 'orangelibrary_';
const POST = '223999888777';
const TARGET = `https://blog.naver.com/${BLOG}/${POST}`;
const TITLE = '강아지 슬개골 탈구 수술 후기';

/** 같은 블로그의 **다른 글** — blogId 만 같다고 인용으로 오판하면 안 된다. */
const SAME_BLOG_OTHER_POST = `https://blog.naver.com/${BLOG}/223000000001`;
/** 제목이 **똑같은 남의 글** — 제목 일치로 인용 판정하면 안 된다(스펙 #11). */
const SAME_TITLE_OTHER_BLOG = 'https://blog.naver.com/otherblogger/222222222222';
const UNRELATED = 'https://blog.naver.com/thirdblogger/221111111111';

const FILLER = '무릎 슬개골이 정상 위치에서 벗어나는 질환으로, 소형견에서 특히 흔하게 나타납니다. '
  + '초기에는 간헐적인 파행만 보이지만 진행되면 관절염으로 이어질 수 있어 조기 진단이 중요합니다. '
  + '수술 여부는 등급과 증상 정도를 함께 고려해 결정합니다.';

const link = (url: string, title: string) => `<a href="${url}">${title}</a>`;

// ── 픽스처 ────────────────────────────────────────────────────────────────
function searchPage(opts: {
  briefing: 'cited' | 'not_cited' | 'trap' | 'no-sources' | 'absent' | 'skeleton';
  tabAnchor?: boolean;
  tabBar?: boolean;
  bodyNotice?: string;
}): string {
  const { briefing, tabAnchor = true, tabBar = true, bodyNotice = '' } = opts;

  const sources: Record<string, string> = {
    cited: link(TARGET, TITLE) + link(UNRELATED, '다른 글'),
    not_cited: link(UNRELATED, '다른 글') + link(SAME_BLOG_OTHER_POST, '내 블로그의 다른 글'),
    trap: link(SAME_TITLE_OTHER_BLOG, TITLE) + link(SAME_BLOG_OTHER_POST, '내 블로그의 다른 글'),
    'no-sources': '',
    absent: '',
    skeleton: '',
  };

  const widget = briefing === 'absent' ? ''
    : briefing === 'skeleton'
      ? '<div class="fds-aib-connected fds-aib-collapsed"><span>AI</span></div>'
      : `<div class="fds-aib-connected">
           <div class="fds-aib-answer">AI 브리핑 · ${FILLER}</div>
           <div class="fds-aib-multi-source-scroll-area">${sources[briefing]}</div>
         </div>`;

  const tabs = tabBar
    ? `<div class="api_flicking_wrap">
         <a href="https://search.naver.com/search.naver?query=q&ssc=tab.nx.all">통합</a>
         ${tabAnchor ? '<a href="https://search.naver.com/search.naver?query=q&ssc=tab.ait.all">AI</a>' : ''}
       </div>`
    : '';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>네이버 검색</title></head>
<body><div id="main_pack">${bodyNotice}${tabs}${widget}</div></body></html>`;
}

function tabPage(opts: {
  answer: 'cited-after-expand' | 'cited' | 'not_cited' | 'no-sources' | 'short' | 'missing';
  streaming?: 'finishes' | 'never-ends' | 'none';
  bodyNotice?: string;
}): string {
  const { answer, streaming = 'finishes', bodyNotice = '' } = opts;

  // 스트리밍 중지 버튼: 등장 → (finishes 면) 사라짐. 엔진이 이 신호로 생성 완료를 판단한다.
  const stop = streaming === 'none' ? '' : '<button aria-label="중지">중지</button>';
  const stopScript = streaming === 'finishes'
    ? `<script>setTimeout(function(){var b=document.querySelector('button[aria-label="중지"]');if(b)b.remove();},1200)</script>`
    : '';

  if (answer === 'missing') {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
<body><div id="main_pack">${bodyNotice}<div class="some-new-naver-container">${FILLER}</div></div></body></html>`;
  }

  const visible = answer === 'cited-after-expand'
    ? link(UNRELATED, '다른 글')
    : answer === 'cited' ? link(TARGET, TITLE) + link(UNRELATED, '다른 글')
      : answer === 'not_cited' ? link(UNRELATED, '다른 글') + link(SAME_BLOG_OTHER_POST, '내 블로그의 다른 글')
        : '';

  // 실측된 핵심 버그: AI 탭은 "+N" 칩을 눌러야 나머지 출처가 DOM 에 **추가**된다.
  const chip = answer === 'cited-after-expand' ? '<button class="more">+2</button>' : '';
  const chipScript = answer === 'cited-after-expand'
    ? `<script>document.querySelector('.more').addEventListener('click',function(){
         document.querySelector('.src').insertAdjacentHTML('beforeend',
           ${JSON.stringify(link(TARGET, TITLE) + link(SAME_BLOG_OTHER_POST, '내 블로그의 다른 글'))});
       })</script>`
    : '';

  const body = answer === 'short' ? 'AI' : `AI 탭 답변 · ${FILLER}`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>네이버 AI</title></head>
<body><div id="main_pack">${bodyNotice}
  <div class="fds-ai-tab-conversation-item">
    <div class="answer">${body}</div>
    <div class="src">${visible}</div>
    ${chip}${stop}
  </div>
</div>${stopScript}${chipScript}</body></html>`;
}

/** 검색 페이지 / AI 탭 페이지를 URL 로 갈라 응답한다. */
function routes(search: string | 'abort', tab: string | 'abort' | null) {
  return (url: string): Route => {
    if (!url.includes('search.naver')) return null;
    if (url.includes('ssc=tab.ait.all')) {
      if (tab === null) return null;
      return tab === 'abort' ? 'abort' : { body: tab };
    }
    return search === 'abort' ? 'abort' : { body: search };
  };
}

// ⚠️ 이 호출은 §3.7에 따라 같은 픽스처를 여러 번(AI_CITATION_SAMPLE_COUNT) 조회한다.
//    픽스처는 결정적이라 판정 결과는 1회 때와 같지만, 실제 브라우저 왕복이 그만큼 늘어난다.
const run = () => checkAiBriefingExposure('강아지 슬개골 탈구', BLOG, POST);

afterAll(async () => { await h.realBrowser?.close().catch(() => {}); });

// ══════════════════════════════════════════════════════════════════════════
describe('성공 경로 — 화면을 끝까지 읽었을 때만 인용/미인용을 단정한다', () => {
  it('브리핑 인용 + 탭 인용 → 양쪽 CITED, 출처 순번까지 기록', async () => {
    h.route = routes(searchPage({ briefing: 'cited' }), tabPage({ answer: 'cited' }));
    const r = await run();

    expect(r.briefing.status).toBe('CITED');
    expect(r.briefing.sourceIndex).toBe(1);
    expect(r.briefing.matchedUrl).toBe(TARGET);
    expect(r.tab.status).toBe('CITED');
    expect(r.exposed).toBe(true);
    expect(r.tabExposed).toBe(true);
  }, 180_000);

  it('브리핑 미인용 + 탭 미인용 → 양쪽 NOT_CITED (출처를 실제로 다 읽음)', async () => {
    h.route = routes(searchPage({ briefing: 'not_cited' }), tabPage({ answer: 'not_cited' }));
    const r = await run();

    expect(r.briefing.status).toBe('NOT_CITED');
    expect(r.briefing.sourceTotal).toBe(2);
    expect(r.tab.status).toBe('NOT_CITED');
    expect(r.exposed).toBe(false);
    expect(r.tabExposed).toBe(false);
    // §3.7 — 미인용은 표본 2회 이상이 일치했을 때만 확정된다. 1회 관측으로 나온 값이 아니다.
    expect(r.briefing.samples).toBeGreaterThanOrEqual(2);
    expect(r.briefing.citedSamples).toBe(0);
  }, 180_000);

  it('탭의 "+N" 칩을 펼쳐야 보이는 출처도 인용으로 잡는다 (이번 수정의 핵심 버그)', async () => {
    h.route = routes(searchPage({ briefing: 'not_cited' }), tabPage({ answer: 'cited-after-expand' }));
    const r = await run();

    // 펼치기 전 DOM 에는 내 글이 없다 — 펼침을 빠뜨리면 여기서 NOT_CITED 가 나왔었다.
    expect(r.tab.status).toBe('CITED');
    expect(r.tab.sourceTotal).toBe(3);
    expect(r.tab.matchedUrl).toBe(TARGET);
  }, 180_000);

  it('제목이 같은 남의 글 · 같은 블로그의 다른 글은 인용이 아니다 (부분 일치 판정 금지)', async () => {
    h.route = routes(searchPage({ briefing: 'trap' }), tabPage({ answer: 'not_cited' }));
    const r = await run();

    expect(r.briefing.status).toBe('NOT_CITED');
    expect(r.briefing.matchedUrl).toBeNull();
  }, 180_000);

  it('두 표면은 독립 — 브리핑 CITED 인데 탭이 실패해도 브리핑 결과를 버리지 않는다', async () => {
    h.route = routes(searchPage({ briefing: 'cited' }), tabPage({ answer: 'missing' }));
    const r = await run();

    expect(r.briefing.status).toBe('CITED');
    expect(r.tab.status).toBe('UNAVAILABLE');
    expect(r.tab.errorCode).toBe('DOM_CHANGED');
    expect(r.exposed).toBe(true);   // 브리핑은 살아남고
    expect(r.tabExposed).toBeNull(); // 탭은 boolean 으로 강등되지 않는다
  }, 180_000);
});

// ══════════════════════════════════════════════════════════════════════════
describe('실패 경로 — 어떤 실패도 미인용(NOT_CITED)이 되어서는 안 된다', () => {
  const notCitedFree = (r: { briefing: { status: string }; tab: { status: string } }) => {
    expect(r.briefing.status).not.toBe('NOT_CITED');
    expect(r.tab.status).not.toBe('NOT_CITED');
  };

  it('페이지 로드 실패(네트워크 차단) → UNVERIFIED / NAV_TIMEOUT', async () => {
    h.route = routes('abort', null);
    const r = await run();

    expect(r.briefing.status).toBe('UNVERIFIED');
    expect(r.briefing.errorCode).toBe('NAV_TIMEOUT');
    expect(r.exposed).toBeNull();
    expect(r.tabExposed).toBeNull();
    notCitedFree(r);
  }, 180_000);

  it('HTTP 503 → UNAVAILABLE / HTTP_ERROR', async () => {
    h.route = url => (url.includes('search.naver') ? { status: 503, body: '<html><body>error</body></html>' } : null);
    const r = await run();

    expect(r.briefing.status).toBe('UNAVAILABLE');
    expect(r.briefing.errorCode).toBe('HTTP_ERROR');
    notCitedFree(r);
  }, 180_000);

  it('자동화 차단 문구 → UNAVAILABLE / BLOCKED', async () => {
    h.route = routes(
      searchPage({ briefing: 'cited', bodyNotice: '<p>잘못된 접근입니다</p>' }),
      tabPage({ answer: 'cited' }),
    );
    const r = await run();

    expect(r.briefing.status).toBe('UNAVAILABLE');
    expect(r.briefing.errorCode).toBe('BLOCKED');
    notCitedFree(r);
  }, 180_000);

  it('CAPTCHA 요구 → UNAVAILABLE / CAPTCHA', async () => {
    h.route = routes(
      searchPage({ briefing: 'cited', bodyNotice: '<p>자동입력 방지 문자를 입력해주세요</p>' }),
      tabPage({ answer: 'cited' }),
    );
    const r = await run();

    expect(r.briefing.status).toBe('UNAVAILABLE');
    expect(r.briefing.errorCode).toBe('CAPTCHA');
    notCitedFree(r);
  }, 180_000);

  it('네이버 마크업 변경(#main_pack 소실) → UNAVAILABLE / PAGE_UNHEALTHY', async () => {
    h.route = routes('<!doctype html><html><body><div id="brand_new_root">검색 결과</div></body></html>', null);
    const r = await run();

    expect(r.briefing.status).toBe('UNAVAILABLE');
    expect(r.briefing.errorCode).toBe('PAGE_UNHEALTHY');
    notCitedFree(r);
  }, 180_000);

  it('답변은 있는데 출처 0건 → UNVERIFIED / NO_SOURCES (미인용이라 말할 근거가 없다)', async () => {
    h.route = routes(searchPage({ briefing: 'no-sources' }), tabPage({ answer: 'no-sources' }));
    const r = await run();

    expect(r.briefing.status).toBe('UNVERIFIED');
    expect(r.briefing.errorCode).toBe('NO_SOURCES');
    expect(r.tab.status).toBe('UNVERIFIED');
    expect(r.tab.errorCode).toBe('NO_SOURCES');
    notCitedFree(r);
  }, 180_000);

  it('브리핑 렌더 미완료(빈 껍데기만 남음) → UNVERIFIED / RENDER_TIMEOUT', async () => {
    h.route = routes(searchPage({ briefing: 'skeleton' }), tabPage({ answer: 'not_cited' }));
    const r = await run();

    expect(r.briefing.status).toBe('UNVERIFIED');
    expect(r.briefing.errorCode).toBe('RENDER_TIMEOUT');
    expect(r.exposed).toBeNull();
  }, 180_000);

  it('탭 답변이 덜 생성됨 → UNVERIFIED / RENDER_TIMEOUT', async () => {
    h.route = routes(searchPage({ briefing: 'not_cited' }), tabPage({ answer: 'short' }));
    const r = await run();

    expect(r.tab.status).toBe('UNVERIFIED');
    expect(r.tab.errorCode).toBe('RENDER_TIMEOUT');
    expect(r.tabExposed).toBeNull();
  }, 180_000);

  it('AI 탭 진입 실패(앵커는 있는데 이동 불가) → UNAVAILABLE / TAB_ENTRY_FAILED', async () => {
    h.route = routes(searchPage({ briefing: 'cited' }), 'abort');
    const r = await run();

    expect(r.briefing.status).toBe('CITED');       // 브리핑은 그대로 살아남는다
    expect(r.tab.status).toBe('UNAVAILABLE');
    expect(r.tab.errorCode).toBe('TAB_ENTRY_FAILED');
    expect(r.tabExposed).toBeNull();
  }, 180_000);

  it('탭 목록 자체를 못 읽음 → UNAVAILABLE / DOM_CHANGED (AI 탭 없음으로 단정하지 않는다)', async () => {
    h.route = routes(searchPage({ briefing: 'cited', tabBar: false }), null);
    const r = await run();

    expect(r.tab.status).toBe('UNAVAILABLE');
    expect(r.tab.errorCode).toBe('DOM_CHANGED');
    notCitedFree({ briefing: { status: 'x' }, tab: r.tab });
  }, 180_000);

  it('AI 탭 답변 생성이 끝나지 않음 → UNVERIFIED / STREAM_TIMEOUT', async () => {
    h.route = routes(
      searchPage({ briefing: 'not_cited' }),
      tabPage({ answer: 'cited', streaming: 'never-ends' }),
    );
    const r = await run();

    expect(r.tab.status).toBe('UNVERIFIED');
    expect(r.tab.errorCode).toBe('STREAM_TIMEOUT');
    expect(r.tabExposed).toBeNull();
  }, 150_000);
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI 영역이 아예 제공되지 않는 키워드', () => {
  it('브리핑 위젯·AI 탭 자체가 없음 → present=false 인 NOT_CITED (화면으로 확인된 사실)', async () => {
    h.route = routes(searchPage({ briefing: 'absent', tabAnchor: false }), null);
    const r = await run();

    expect(r.briefing.status).toBe('NOT_CITED');
    expect(r.briefing.present).toBe(false);
    expect(r.tab.status).toBe('NOT_CITED');
    expect(r.tab.present).toBe(false);
  }, 180_000);
});
