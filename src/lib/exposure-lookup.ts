/**
 * exposure-lookup.ts — 노출 현황 "30일 이전 확장 조회"의 서버측 산정·작업 로직.
 *
 * 원칙(스펙 #5·#14·#15·#18):
 *  - 크레딧 계산 기준은 "전체 개수"가 아니라 "실제 새로 조회해야 하는 개수"다.
 *    최근 성공 검사(캐시 유효)된 글은 재조회하지 않으므로 신규 조회·과금에서 제외한다.
 *  - 클라이언트가 보낸 후보 postId 집합의 소유권은 라우트(assertBlogResourceAccess)가 검증하고,
 *    "신규 조회 수/과금 수"는 이 서버 로직이 DB(post_missing_checks)를 근거로 재산정한다(클라 숫자 불신).
 *
 * 실제 노출 검사(네이버 조회)와 결과 저장은 기존 /api/blog/check-missing + post_missing_checks 를
 * 그대로 사용한다(공통 DB·대시보드 연동, 스펙 #17). 이 파일은 "무엇을/몇 개를/얼마에" 만 결정한다.
 */

import type { createServiceClient } from '@/lib/supabase-server';
import {
  EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT,
  EXPOSURE_RECHECK_FRESH_MS,
  type ExtendedLookupPlan,
} from '@/lib/exposure-policy';

type Supabase = ReturnType<typeof createServiceClient>;

export interface ExtendedLookupPlanDetail extends ExtendedLookupPlan {
  /** 실제 새로 조회해야 하는 postId 목록(캐시 유효분 제외) */
  newCheckIds: string[];
}

/**
 * 후보 postId 집합에 대해 "신규 조회 대상/캐시 제외/과금 대상"을 산정한다(§5·§14·§15).
 * @param candidatePostIds 30일 이전 & 선택 기간 내 & 공개 글의 postId (클라가 보낸 후보)
 */
export async function computeExtendedPlan(
  supabase: Supabase,
  blogId: string,
  candidatePostIds: string[],
): Promise<ExtendedLookupPlanDetail> {
  const freeLimit = EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT;
  const ids = Array.from(new Set(candidatePostIds.filter(Boolean)));
  if (ids.length === 0) {
    return { totalCandidates: 0, cached: 0, newChecks: 0, freeLimit, chargeable: 0, newCheckIds: [] };
  }

  // 후보들의 최근 검사 상태 조회 — 성공(status='ok') & 신선(checked_at 최근)한 글만 "캐시 유효"로 제외.
  const freshCutoffIso = new Date(Date.now() - EXPOSURE_RECHECK_FRESH_MS).toISOString();
  const freshIds = new Set<string>();
  // .in() 인자 과다 방지를 위해 청크 조회
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('post_missing_checks')
      .select('post_id, checked_at, status')
      .eq('blog_id', blogId)
      .in('post_id', chunk)
      .eq('status', 'ok')
      .gte('checked_at', freshCutoffIso);
    if (error) {
      // 조회 실패 시엔 캐시 제외를 보수적으로 적용하지 않는다(= 전부 신규로 간주). 과금 과다를 피하려면
      // 오히려 위험하나, 여기선 "정확한 캐시 판단 불가"를 신규로 처리하되, 호출측이 이 상황을 로깅한다.
      console.warn(`[exposure-lookup] 캐시 판정 조회 실패 blogId=${blogId}:`, error.message);
      continue;
    }
    for (const r of data ?? []) if (r.post_id) freshIds.add(r.post_id as string);
  }

  const newCheckIds = ids.filter(id => !freshIds.has(id));
  const newChecks = newCheckIds.length;
  const chargeable = Math.max(0, newChecks - freeLimit);
  return {
    totalCandidates: ids.length,
    cached: ids.length - newChecks,
    newChecks,
    freeLimit,
    chargeable,
    newCheckIds,
  };
}

// ── 작업(job) 영속화 — 멱등·진행상태·정산(§9·§10·§11) ─────────────────────────

export type ExposureJobStatus = 'pending' | 'running' | 'completed' | 'partial_failed' | 'failed' | 'cancelled';

export interface ExposureJob {
  id: string;
  user_id: string;
  blog_id: string;
  reference_id: string;
  status: ExposureJobStatus;
  total_new_checks: number;
  chargeable: number;
  processed: number;
  failed: number;
  charged_credits: number;
  settled: boolean;
  refunded_credits: number;
  created_at: string;
}

/** reference_id 로 기존 작업을 찾는다(멱등 재승인 감지). 없으면 null. 42P01(테이블 미생성) 시 null. */
export async function getJobByReference(supabase: Supabase, userId: string, referenceId: string): Promise<ExposureJob | null> {
  const { data, error } = await supabase
    .from('exposure_lookup_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('reference_id', referenceId)
    .maybeSingle();
  if (error) return null;
  return (data as ExposureJob) ?? null;
}

/** 작업 생성(멱등: reference_id UNIQUE). 이미 있으면 기존 행 반환. 테이블 미생성이면 null(과금은 별도로 안전 처리). */
export async function createJob(
  supabase: Supabase,
  input: { userId: string; blogId: string; referenceId: string; totalNewChecks: number; chargeable: number },
): Promise<ExposureJob | null> {
  const existing = await getJobByReference(supabase, input.userId, input.referenceId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('exposure_lookup_jobs')
    .insert({
      user_id: input.userId,
      blog_id: input.blogId,
      reference_id: input.referenceId,
      status: 'running',
      total_new_checks: input.totalNewChecks,
      chargeable: input.chargeable,
    })
    .select('*')
    .single();
  if (error) {
    // 경합(동시 재승인)으로 UNIQUE 충돌 시 기존 행을 다시 읽어 반환
    const again = await getJobByReference(supabase, input.userId, input.referenceId);
    if (again) return again;
    console.warn(`[exposure-lookup] job 생성 실패 ref=${input.referenceId}:`, error.message);
    return null;
  }
  return data as ExposureJob;
}

export async function updateJob(
  supabase: Supabase,
  id: string,
  patch: Partial<Pick<ExposureJob, 'status' | 'processed' | 'failed' | 'charged_credits' | 'settled' | 'refunded_credits'>> & { error_message?: string },
): Promise<void> {
  const { error } = await supabase
    .from('exposure_lookup_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn(`[exposure-lookup] job 갱신 실패 id=${id}:`, error.message);
}

/**
 * 정산용: 승인 이후(job.created_at 이후) 실제 성공 검사된 신규 후보 수를 DB 근거로 센다(클라 불신, §10).
 */
export async function countCompletedSince(
  supabase: Supabase,
  blogId: string,
  newCheckIds: string[],
  sinceIso: string,
): Promise<number> {
  const ids = Array.from(new Set(newCheckIds.filter(Boolean)));
  if (ids.length === 0) return 0;
  let completed = 0;
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { count, error } = await supabase
      .from('post_missing_checks')
      .select('post_id', { count: 'exact', head: true })
      .eq('blog_id', blogId)
      .in('post_id', chunk)
      .eq('status', 'ok')
      .gte('checked_at', sinceIso);
    if (!error && typeof count === 'number') completed += count;
  }
  return completed;
}
