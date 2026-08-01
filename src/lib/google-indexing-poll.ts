import { createServiceClient } from './supabase-server';
import { getValidAccessToken } from './google-oauth';
import { inspectUrl, GoogleApiError, type UrlInspectionResult } from './google-search-console';

const RECHECK_SCHEDULE_MS = [12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]; // 1차 확인 후 +12h, 2차 확인 후 +24h
const MAX_CHECKS = 3;
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface IndexedUrlRow {
  id: string;
  user_id: string;
  url: string;
  check_count: number;
}

interface ClassifiedError {
  errorCode: string;
  httpStatus: number | null;
  retryable: boolean;
  message: string;
  rawBody: string | null;
}

/**
 * 예외를 프론트에 노출 가능한 형태(에러코드/HTTP상태/재시도가능여부)로 분류한다.
 * GoogleApiError는 실제 Google 응답의 HTTP 상태코드를 갖고 있으므로 그대로 사용하고,
 * 그 외(네트워크 타임아웃 등)는 재시도로 해결될 가능성이 있다고 본다.
 */
function classifyError(err: unknown): ClassifiedError {
  if (err instanceof GoogleApiError) {
    return {
      errorCode: `HTTP_${err.httpStatus}`,
      httpStatus: err.httpStatus,
      retryable: RETRYABLE_HTTP_STATUS.has(err.httpStatus),
      message: err.message,
      rawBody: err.responseBody,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { errorCode: 'NETWORK', httpStatus: null, retryable: true, message, rawBody: null };
}

/**
 * GSC 응답 필드에서 규칙기반으로 실패 원인을 판정한다.
 * 의미판단이 필요한 케이스(중복콘텐츠/콘텐츠부족/내부링크부족)는 Phase 2의
 * Claude 진단이 덧붙여질 때까지 'not_discovered'(가장 일반적인 원인)로 둔다.
 */
function classifyFailure(result: UrlInspectionResult): string {
  if (result.robotsTxtState === 'DISALLOWED') return 'robots_blocked';
  if (result.indexingState === 'INDEXING_DISALLOWED') return 'noindex';
  if (result.pageFetchState === 'NOT_FOUND' || result.pageFetchState === 'SOFT_404') return 'not_found';
  if (result.googleCanonical && result.userCanonical && result.googleCanonical !== result.userCanonical) {
    return 'canonical_issue';
  }
  const coverage = (result.coverageState || '').toLowerCase();
  if (coverage.includes('crawled') && coverage.includes('not indexed')) return 'thin_content';
  if (coverage.includes('discovered') && coverage.includes('not indexed')) return 'crawl_pending';
  if (coverage.includes('duplicate')) return 'duplicate_content';
  return 'not_discovered';
}

/**
 * 한 건의 등록 URL에 대해 URL Inspection API를 호출하고 결과를 DB에 반영한다.
 * 크론(google-indexing-poll)과 수동 재확인 라우트가 공유하는 로직.
 */
export async function inspectAndUpdate(row: IndexedUrlRow): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  let conn;
  try {
    conn = await getValidAccessToken(row.user_id);
  } catch (err) {
    // refresh_token으로 access token 갱신 자체가 실패한 경우(예: 사용자가 Google 쪽에서 앱 연결을 해제함)
    const classified = classifyError(err);
    console.error('[google-indexing-poll] getValidAccessToken 실패:', row.id, classified);
    await supabase.from('indexed_url_checks').insert({
      indexed_url_id: row.id,
      user_id: row.user_id,
      api_call_success: false,
      error_message: classified.message,
      raw_response: classified.rawBody ? { body: classified.rawBody } : null,
    });
    await supabase
      .from('indexed_urls')
      .update({
        status: 'error',
        error_code: classified.errorCode,
        http_status: classified.httpStatus,
        retryable: classified.retryable,
        error_message: classified.message,
        last_checked_at: now,
        next_check_at: null,
        updated_at: now,
      })
      .eq('id', row.id);
    return;
  }

  if (!conn) {
    await supabase
      .from('indexed_urls')
      .update({
        status: 'error',
        error_code: 'NOT_CONNECTED',
        http_status: null,
        retryable: false,
        error_message: 'Google 계정이 연결되어 있지 않습니다. 대시보드에서 Google 계정을 연결해주세요.',
        last_checked_at: now,
        next_check_at: null,
        updated_at: now,
      })
      .eq('id', row.id);
    return;
  }

  if (!conn.siteUrl) {
    await supabase
      .from('indexed_urls')
      .update({
        status: 'error',
        error_code: 'SITE_NOT_VERIFIED',
        http_status: null,
        retryable: false,
        error_message: 'Google 계정은 연결되었지만 이 블로그의 GSC(Search Console) 속성 소유권이 아직 확인되지 않았습니다.',
        last_checked_at: now,
        next_check_at: null,
        updated_at: now,
      })
      .eq('id', row.id);
    return;
  }

  let result: UrlInspectionResult;
  try {
    result = await inspectUrl(conn.accessToken, conn.siteUrl, row.url);
  } catch (err) {
    const classified = classifyError(err);
    console.error('[google-indexing-poll] inspectUrl 실패:', row.id, classified);
    await supabase
      .from('indexed_url_checks')
      .insert({
        indexed_url_id: row.id,
        user_id: row.user_id,
        api_call_success: false,
        error_message: classified.message,
        raw_response: classified.rawBody ? { body: classified.rawBody } : null,
      });
    await supabase
      .from('indexed_urls')
      .update({
        status: 'error',
        error_code: classified.errorCode,
        http_status: classified.httpStatus,
        retryable: classified.retryable,
        last_checked_at: now,
        next_check_at: classified.retryable ? new Date(Date.now() + RECHECK_SCHEDULE_MS[0]).toISOString() : null,
        retry_count: (row.check_count ?? 0) + 1,
        error_message: classified.message,
        updated_at: now,
      })
      .eq('id', row.id);
    return;
  }

  console.log('[google-indexing-poll] inspectUrl 성공:', row.id, 'verdict:', result.verdict, 'coverageState:', result.coverageState);

  await supabase.from('indexed_url_checks').insert({
    indexed_url_id: row.id,
    user_id: row.user_id,
    verdict: result.verdict,
    coverage_state: result.coverageState,
    raw_response: result,
    api_call_success: true,
  });

  const newCheckCount = (row.check_count ?? 0) + 1;
  const isIndexed = result.verdict === 'PASS';
  const isFinalCheck = newCheckCount >= MAX_CHECKS;
  const nextCheckAt = isIndexed || isFinalCheck ? null : new Date(Date.now() + RECHECK_SCHEDULE_MS[newCheckCount - 1]).toISOString();

  await supabase
    .from('indexed_urls')
    .update({
      status: isIndexed ? 'indexed' : isFinalCheck ? 'not_indexed' : 'checking',
      progress_stage: isIndexed || isFinalCheck ? 'done' : 'checking',
      google_verdict: result.verdict ?? null,
      google_coverage_state: result.coverageState ?? null,
      failure_reason_code: isIndexed ? null : classifyFailure(result),
      indexed_at: isIndexed ? now : null,
      check_count: newCheckCount,
      last_checked_at: now,
      next_check_at: nextCheckAt,
      error_message: null,
      error_code: null,
      http_status: null,
      retryable: null,
      updated_at: now,
    })
    .eq('id', row.id);
}
