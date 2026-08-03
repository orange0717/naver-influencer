/**
 * Google Search Console REST 클라이언트 (얇은 wrapper).
 * googleapis SDK 대신 fetch로 직접 호출 — 필요한 엔드포인트 3개뿐이라
 * 무거운 SDK를 추가하지 않는다.
 *
 * 공식 준수 방침: Indexing API(JobPosting/BroadcastEvent 전용)는 사용하지 않고
 * Sitemaps API(제출) + URL Inspection API(상태조회)만 사용한다.
 */

const WEBMASTERS_BASE = 'https://www.googleapis.com/webmasters/v3';
const SEARCHCONSOLE_BASE = 'https://searchconsole.googleapis.com/v1';

/** Google API가 non-2xx로 응답했을 때 던지는 구조화된 에러. HTTP 상태코드와 원본 응답 바디를 그대로 보존한다. */
export class GoogleApiError extends Error {
  readonly httpStatus: number;
  readonly responseBody: string;

  constructor(context: string, httpStatus: number, responseBody: string) {
    super(`${context}: HTTP ${httpStatus} ${responseBody}`);
    this.name = 'GoogleApiError';
    this.httpStatus = httpStatus;
    this.responseBody = responseBody;
  }
}

async function googleApiFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

/** 이 계정이 소유권을 확인받은 GSC 속성(사이트) 목록 */
export async function listSites(accessToken: string): Promise<GscSite[]> {
  const res = await googleApiFetch(`${WEBMASTERS_BASE}/sites`, accessToken);
  const text = await res.text().catch(() => '');
  console.log('[gsc] listSites status:', res.status, 'body:', text);
  if (!res.ok) {
    throw new GoogleApiError('GSC listSites 실패', res.status, text);
  }
  const data = text ? JSON.parse(text) : {};
  return data.siteEntry ?? [];
}

/** 사이트맵 제출/재제출 (feedpath는 sitemap.xml의 전체 URL) */
export async function submitSitemap(accessToken: string, siteUrl: string, feedpath: string): Promise<void> {
  const url = `${WEBMASTERS_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`;
  const res = await googleApiFetch(url, accessToken, { method: 'PUT' });
  const text = await res.text().catch(() => '');
  console.log('[gsc] submitSitemap status:', res.status, 'body:', text);
  if (!res.ok) {
    throw new GoogleApiError('GSC submitSitemap 실패', res.status, text);
  }
}

export interface UrlInspectionResult {
  verdict?: string; // PASS|PARTIAL|FAIL|NEUTRAL
  coverageState?: string;
  robotsTxtState?: string; // ALLOWED|DISALLOWED
  indexingState?: string; // INDEXING_ALLOWED|INDEXING_DISALLOWED
  pageFetchState?: string; // SUCCESSFUL|SOFT_404|NOT_FOUND|...
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
  sitemap?: string[];
  referringUrls?: string[];
  crawledAs?: string;
}

/** URL Inspection API로 개별 URL의 색인 상태를 조회 */
export async function inspectUrl(
  accessToken: string,
  siteUrl: string,
  inspectionUrl: string,
): Promise<UrlInspectionResult> {
  const res = await googleApiFetch(`${SEARCHCONSOLE_BASE}/urlInspection/index:inspect`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  const text = await res.text().catch(() => '');
  console.log('[gsc] inspectUrl', inspectionUrl, 'status:', res.status, 'body:', text);
  if (!res.ok) {
    throw new GoogleApiError('GSC inspectUrl 실패', res.status, text);
  }
  const data = text ? JSON.parse(text) : {};
  const indexResult = data.inspectionResult?.indexStatusResult ?? {};
  return {
    verdict: indexResult.verdict,
    coverageState: indexResult.coverageState,
    robotsTxtState: indexResult.robotsTxtState,
    indexingState: indexResult.indexingState,
    pageFetchState: indexResult.pageFetchState,
    lastCrawlTime: indexResult.lastCrawlTime,
    googleCanonical: indexResult.googleCanonical,
    userCanonical: indexResult.userCanonical,
    sitemap: indexResult.sitemap,
    referringUrls: indexResult.referringUrls,
    crawledAs: indexResult.crawledAs,
  };
}
