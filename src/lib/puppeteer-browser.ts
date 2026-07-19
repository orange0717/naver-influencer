import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * 서버리스 Puppeteer 브라우저 공용 풀 — naver-ai-briefing.ts에서 검증된 launch 로직을
 * 추출해 다른 크롤러(예: blog-crawler.ts의 방문자수 수집)에서도 재사용한다.
 */

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

export async function getBrowser(forceNew = false): Promise<Browser> {
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

export function invalidateBrowserCache(): void {
  cachedBrowserPromise = null;
}

/** Puppeteer/Chromium 프로세스 자체가 죽어서 발생하는 에러인지 판별 — 이 경우만 캐시 무효화 후 재시도 */
export function isBrowserDeadError(message: string): boolean {
  return /Protocol error|Target closed|Session closed|Connection closed|WebSocket is (not open|closed)/i.test(message);
}
