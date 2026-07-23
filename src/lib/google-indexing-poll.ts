import { createServiceClient } from './supabase-server';
import { getValidAccessToken } from './google-oauth';
import { inspectUrl, type UrlInspectionResult } from './google-search-console';

const RECHECK_SCHEDULE_MS = [12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]; // 1차 확인 후 +12h, 2차 확인 후 +24h
const MAX_CHECKS = 3;

interface IndexedUrlRow {
  id: string;
  user_id: string;
  url: string;
  check_count: number;
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

  const conn = await getValidAccessToken(row.user_id);
  if (!conn || !conn.siteUrl) {
    await supabase
      .from('indexed_urls')
      .update({
        status: 'error',
        error_message: 'Google 계정이 연결되지 않았거나 GSC 속성이 확인되지 않았습니다.',
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
    await supabase
      .from('indexed_url_checks')
      .insert({
        indexed_url_id: row.id,
        user_id: row.user_id,
        api_call_success: false,
        error_message: err instanceof Error ? err.message : String(err),
      });
    await supabase
      .from('indexed_urls')
      .update({
        last_checked_at: now,
        retry_count: (row.check_count ?? 0) + 1,
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: now,
      })
      .eq('id', row.id);
    return;
  }

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
      updated_at: now,
    })
    .eq('id', row.id);
}
