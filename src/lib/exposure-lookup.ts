/**
 * exposure-lookup.ts — 노출 현황 "30일 이전 확장 조회" 서버 로직.
 *
 * ⚠️ 2026-08-14: 실제 구현은 analytics-lookup.ts(3화면 공통 단일 billing 로직)로 이관됐다.
 * 이 파일은 feature='exposure' 로 위임하는 얇은 래퍼만 유지한다 — 기존 exposure-extend 라우트가
 * 시그니처 변경 없이 그대로 동작하도록(노출 동작 불변). 새 구현/일반화는 analytics-lookup.ts 를 쓴다.
 */

import type { createServiceClient } from '@/lib/supabase-server';
import {
  computeLookupPlan,
  countLookupCompletedSince,
  createLookupJob,
  getLookupJobByReference,
  updateLookupJob,
  type ExtendedLookupPlan,
  type ExtendedLookupPlanDetail,
  type LookupJob,
  type LookupJobStatus,
} from '@/lib/analytics-lookup';

type Supabase = ReturnType<typeof createServiceClient>;

export type { ExtendedLookupPlan, ExtendedLookupPlanDetail };
// 기존 타입 이름 호환(ExposureJob 은 feature 필드를 포함한 LookupJob 의 별칭 — 상위호환).
export type ExposureJobStatus = LookupJobStatus;
export type ExposureJob = LookupJob;

export function computeExtendedPlan(
  supabase: Supabase,
  blogId: string,
  candidatePostIds: string[],
): Promise<ExtendedLookupPlanDetail> {
  return computeLookupPlan(supabase, 'exposure', blogId, candidatePostIds);
}

export function getJobByReference(supabase: Supabase, userId: string, referenceId: string): Promise<ExposureJob | null> {
  return getLookupJobByReference(supabase, userId, referenceId);
}

export function createJob(
  supabase: Supabase,
  input: { userId: string; blogId: string; referenceId: string; totalNewChecks: number; chargeable: number },
): Promise<ExposureJob | null> {
  return createLookupJob(supabase, { ...input, feature: 'exposure' });
}

export function updateJob(
  supabase: Supabase,
  id: string,
  patch: Partial<Pick<ExposureJob, 'status' | 'processed' | 'failed' | 'charged_credits' | 'settled' | 'refunded_credits'>> & { error_message?: string },
): Promise<void> {
  return updateLookupJob(supabase, id, patch);
}

export function countCompletedSince(
  supabase: Supabase,
  blogId: string,
  newCheckIds: string[],
  sinceIso: string,
): Promise<number> {
  return countLookupCompletedSince(supabase, 'exposure', blogId, newCheckIds, sinceIso);
}
