/**
 * analytics-lookup.ts — 3개 분석 화면(노출 현황·키워드 순위·AI 브리핑)이 공유하는
 * "30일 이전 확장 조회" 산정·과금·작업 로직의 단일 구현(공통 billing 로직).
 *
 * 사용자 지시(스펙): "노출 현황·키워드순위·AI 브리핑에서 각각 다른 크레딧 계산 로직을 만들지 말고
 * 공통 Credit/Billing 로직을 사용." → 이 파일이 그 단일 구현이다.
 *
 * feature 별로 다른 것은 **오직 "무엇이 이미 조회되었는가(캐시/완료)"를 판단하는 원본 테이블 하나뿐**이다.
 * 나머지(무료 90 초과분 과금·멱등·부분정산·환불·잔액확인)는 전부 동일하다.
 *   - exposure     → post_missing_checks   (status='ok')
 *   - keyword_rank → keyword_rank_lookups  (status='ok')      // migration-142 로 status 추가
 *   - ai_citation  → ai_briefing_exposures (check_status='ok' 또는 legacy null+checked_at)
 *
 * 크레딧 계산 기준은 "전체 개수"가 아니라 "실제 새로 조회해야 하는 개수"다. 이미 조회되어 DB에 저장돼
 * 있거나 캐시가 유효한 데이터는 신규 조회·과금에서 제외한다(스펙 공통). 클라 숫자는 신뢰하지 않는다.
 */

import type { createServiceClient } from '@/lib/supabase-server';
import { getCreditCost } from './settings';
import type { CreditFeature } from './credit-config';

type Supabase = ReturnType<typeof createServiceClient>;

export type LookupFeature = 'exposure' | 'keyword_rank' | 'ai_citation';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 최근 N일까지 기본(무료), 초과 = 회원 전용 — 3화면 공통(기본 30). */
export const LOOKUP_FREE_DAYS = intEnv('EXPOSURE_FREE_DAYS', 30);
/** 회원이 30일 이전을 조회할 때 이 개수까지 무료, 초과분만 과금 — 3화면 공통(기본 90). */
export const LOOKUP_MEMBER_FREE_LIMIT = intEnv('EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT', 90);

/** feature 별 "이미 조회됨" 판단 원본 + 크레딧 기능 키 + 신선도(캐시) 창. */
interface FeaturePolicy {
  creditFeature: CreditFeature;
  /** 신규 조회 대상/캐시 판정에 쓰는 원본 테이블 */
  checksTable: string;
  /** 성공 상태 컬럼명 */
  statusColumn: string;
  /** 성공 값 */
  okValue: string;
  /** status 가 NULL 이어도 checked_at 이 있으면 성공으로 간주(AI 레거시 행 호환) */
  treatNullStatusAsOk: boolean;
  /** 이 시간 내 성공 검사분은 재조회하지 않음(과금 제외) */
  freshMs: number;
}

const POLICIES: Record<LookupFeature, FeaturePolicy> = {
  exposure: {
    creditFeature: 'bulk_exposure_check',
    checksTable: 'post_missing_checks',
    statusColumn: 'status',
    okValue: 'ok',
    treatNullStatusAsOk: false,
    freshMs: intEnv('EXPOSURE_RECHECK_FRESH_HOURS', 20) * 60 * 60 * 1000,
  },
  keyword_rank: {
    creditFeature: 'bulk_keyword_rank',
    checksTable: 'keyword_rank_lookups',
    statusColumn: 'status',
    okValue: 'ok',
    treatNullStatusAsOk: false,
    freshMs: intEnv('KEYWORD_RANK_FRESH_HOURS', 20) * 60 * 60 * 1000,
  },
  ai_citation: {
    creditFeature: 'bulk_ai_citation',
    checksTable: 'ai_briefing_exposures',
    statusColumn: 'check_status',
    okValue: 'ok',
    treatNullStatusAsOk: true,
    freshMs: intEnv('AI_CITATION_FRESH_HOURS', 24) * 60 * 60 * 1000,
  },
};

export function getLookupPolicy(feature: LookupFeature): FeaturePolicy {
  return POLICIES[feature];
}

export function isLookupFeature(v: unknown): v is LookupFeature {
  return v === 'exposure' || v === 'keyword_rank' || v === 'ai_citation';
}

/** 초과 1개당 크레딧 단가 — app_settings(credit_costs) 우선, 없으면 credit-config 기본. */
export async function getLookupCreditPerItem(feature: LookupFeature): Promise<number> {
  return getCreditCost(POLICIES[feature].creditFeature);
}

export function getLookupCreditFeature(feature: LookupFeature): CreditFeature {
  return POLICIES[feature].creditFeature;
}

/** 조회 대상 계산 결과 — 서버가 산정하며 클라 숫자를 신뢰하지 않는다. */
export interface ExtendedLookupPlan {
  totalCandidates: number;
  cached: number;
  newChecks: number;
  freeLimit: number;
  chargeable: number;
}
export interface ExtendedLookupPlanDetail extends ExtendedLookupPlan {
  /** 실제 새로 조회해야 하는 postId 목록(캐시 유효분 제외) */
  newCheckIds: string[];
}

/**
 * 후보 postId 중 "성공 & 신선(캐시 유효)"한 것을 원본 테이블에서 찾아 Set 으로 반환.
 * feature 별 테이블/상태컬럼/신선도만 다르고 로직은 동일.
 */
async function freshOkPostIds(
  supabase: Supabase,
  feature: LookupFeature,
  blogId: string,
  ids: string[],
  freshCutoffIso: string,
): Promise<Set<string>> {
  const p = POLICIES[feature];
  const freshIds = new Set<string>();
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    let q = supabase
      .from(p.checksTable)
      .select('post_id, checked_at')
      .eq('blog_id', blogId)
      .in('post_id', chunk)
      .gte('checked_at', freshCutoffIso);
    // 성공 상태 필터 — AI 는 legacy null(check_status 없음 + checked_at 있음)도 성공으로 인정.
    q = p.treatNullStatusAsOk
      ? q.or(`${p.statusColumn}.eq.${p.okValue},${p.statusColumn}.is.null`)
      : q.eq(p.statusColumn, p.okValue);
    const { data, error } = await q;
    if (error) {
      // 캐시 판정 실패 시 보수적으로 "신규"로 간주(= freshIds 에 넣지 않음). 과금 과다를 피하려면
      // 위험할 수 있으나 정확한 캐시 판단 불가를 신규로 처리한다(호출측이 이 상황을 로깅).
      console.warn(`[analytics-lookup:${feature}] 캐시 판정 조회 실패 blogId=${blogId}:`, error.message);
      continue;
    }
    for (const r of (data ?? []) as { post_id: string | null }[]) if (r.post_id) freshIds.add(r.post_id);
  }
  return freshIds;
}

/** 후보 postId 집합에 대해 "신규 조회 대상/캐시 제외/과금 대상"을 산정한다. */
export async function computeLookupPlan(
  supabase: Supabase,
  feature: LookupFeature,
  blogId: string,
  candidatePostIds: string[],
): Promise<ExtendedLookupPlanDetail> {
  const freeLimit = LOOKUP_MEMBER_FREE_LIMIT;
  const ids = Array.from(new Set(candidatePostIds.filter(Boolean)));
  if (ids.length === 0) {
    return { totalCandidates: 0, cached: 0, newChecks: 0, freeLimit, chargeable: 0, newCheckIds: [] };
  }
  const freshCutoffIso = new Date(Date.now() - POLICIES[feature].freshMs).toISOString();
  const freshIds = await freshOkPostIds(supabase, feature, blogId, ids, freshCutoffIso);
  const newCheckIds = ids.filter((id) => !freshIds.has(id));
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

/** 정산용: 승인 이후(sinceIso 이후) 실제 성공 검사된 신규 후보 수를 DB 근거로 센다(클라 불신). */
export async function countLookupCompletedSince(
  supabase: Supabase,
  feature: LookupFeature,
  blogId: string,
  newCheckIds: string[],
  sinceIso: string,
): Promise<number> {
  const p = POLICIES[feature];
  const ids = Array.from(new Set(newCheckIds.filter(Boolean)));
  if (ids.length === 0) return 0;
  let completed = 0;
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    let q = supabase
      .from(p.checksTable)
      .select('post_id', { count: 'exact', head: true })
      .eq('blog_id', blogId)
      .in('post_id', chunk)
      .gte('checked_at', sinceIso);
    q = p.treatNullStatusAsOk
      ? q.or(`${p.statusColumn}.eq.${p.okValue},${p.statusColumn}.is.null`)
      : q.eq(p.statusColumn, p.okValue);
    const { count, error } = await q;
    if (!error && typeof count === 'number') completed += count;
  }
  return completed;
}

// ── 작업(job) 영속화 — 멱등·진행상태·정산. 3화면이 공통 테이블(exposure_lookup_jobs)을 feature 컬럼으로 공유. ──

export type LookupJobStatus = 'pending' | 'running' | 'completed' | 'partial_failed' | 'failed' | 'cancelled';

export interface LookupJob {
  id: string;
  user_id: string;
  blog_id: string;
  feature: LookupFeature;
  reference_id: string;
  status: LookupJobStatus;
  total_new_checks: number;
  chargeable: number;
  processed: number;
  failed: number;
  charged_credits: number;
  settled: boolean;
  refunded_credits: number;
  created_at: string;
}

const JOBS_TABLE = 'exposure_lookup_jobs'; // migration-155 에서 feature 컬럼 추가(default 'exposure')로 3화면 공용화

/** reference_id 로 기존 작업을 찾는다(멱등 재승인 감지). 없으면/오류면 null. */
export async function getLookupJobByReference(supabase: Supabase, userId: string, referenceId: string): Promise<LookupJob | null> {
  const { data, error } = await supabase
    .from(JOBS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('reference_id', referenceId)
    .maybeSingle();
  if (error) return null;
  return (data as LookupJob) ?? null;
}

/** 작업 생성(멱등: reference_id UNIQUE). 이미 있으면 기존 행 반환. 테이블 미생성이면 null. */
export async function createLookupJob(
  supabase: Supabase,
  input: { userId: string; blogId: string; feature: LookupFeature; referenceId: string; totalNewChecks: number; chargeable: number },
): Promise<LookupJob | null> {
  const existing = await getLookupJobByReference(supabase, input.userId, input.referenceId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from(JOBS_TABLE)
    .insert({
      user_id: input.userId,
      blog_id: input.blogId,
      feature: input.feature,
      reference_id: input.referenceId,
      status: 'running',
      total_new_checks: input.totalNewChecks,
      chargeable: input.chargeable,
    })
    .select('*')
    .single();
  if (error) {
    const again = await getLookupJobByReference(supabase, input.userId, input.referenceId);
    if (again) return again;
    console.warn(`[analytics-lookup:${input.feature}] job 생성 실패 ref=${input.referenceId}:`, error.message);
    return null;
  }
  return data as LookupJob;
}

export async function updateLookupJob(
  supabase: Supabase,
  id: string,
  patch: Partial<Pick<LookupJob, 'status' | 'processed' | 'failed' | 'charged_credits' | 'settled' | 'refunded_credits'>> & { error_message?: string },
): Promise<void> {
  const { error } = await supabase
    .from(JOBS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn(`[analytics-lookup] job 갱신 실패 id=${id}:`, error.message);
}
