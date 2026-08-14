/**
 * exposure-policy.ts — 노출 현황 "조회 범위 권한 + 크레딧" 정책 상수 (Single Source of Truth).
 *
 * §7·§18·§19: 기간(일)과 무료 조회 개수(건)는 서로 다른 축이다. 값을 코드 곳곳에 하드코딩하지 말고
 * 반드시 이 파일을 참조한다. 정책은 향후 조정될 수 있으므로 env override(관리자 조정)를 허용하고,
 * 값이 없으면 기본값으로 fail-open 한다.
 *
 *   DEFAULT_FREE_DAYS / MEMBER_ONLY_AFTER_DAYS = EXPOSURE_FREE_DAYS (기본 30)
 *   MEMBER_FREE_LOOKUP_LIMIT                    = EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT (기본 90)
 *   초과 1개당 크레딧 단가                       = getCreditCost('bulk_exposure_check') (기본 1, app_settings 로 조정)
 */

import { getCreditCost } from './settings';
import type { CreditFeature } from './credit-config';

/** 확장 조회 과금에 쓰는 크레딧 기능 키(초과 1개당 단가). */
export const EXPOSURE_CREDIT_FEATURE: CreditFeature = 'bulk_exposure_check';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 최근 N일까지는 기본(무료) 조회. 이 값 초과 = 30일 이전 = 회원 전용(§1·§3·§12). */
export const EXPOSURE_FREE_DAYS = intEnv('EXPOSURE_FREE_DAYS', 30);

/** 회원이 30일 이전을 조회할 때, 이 개수까지는 크레딧 없이 무료. 초과분만 과금(§5·§18). */
export const EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT = intEnv('EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT', 90);

/**
 * 신선도(캐시) 기간. 이 시간 내에 "성공적으로" 검사된 글은 재조회하지 않으므로(§14·§15)
 * 신규 조회 대상·크레딧 계산에서 제외한다. 서버 크론 재검사 주기(20h)와 정합.
 */
export const EXPOSURE_RECHECK_FRESH_MS = intEnv('EXPOSURE_RECHECK_FRESH_HOURS', 20) * 60 * 60 * 1000;

/** 초과 1개당 크레딧 단가 — app_settings(credit_costs) 우선, 없으면 credit-config 기본(1). */
export async function getExposureCreditPerPost(): Promise<number> {
  return getCreditCost(EXPOSURE_CREDIT_FEATURE);
}

/** 조회 대상 계산 결과(§4·§5·§14·§15·§18) — 서버가 산정하며 클라 숫자를 신뢰하지 않는다. */
export interface ExtendedLookupPlan {
  /** 요청된 30일 이전 후보 전체 수 */
  totalCandidates: number;
  /** 이미 최근 조회되어(캐시 유효) 재조회 불필요한 수 — 과금 제외 */
  cached: number;
  /** 실제 새로 조회해야 하는 수 = totalCandidates - cached */
  newChecks: number;
  /** 무료 조회 한도(90) */
  freeLimit: number;
  /** 과금 대상 수 = max(0, newChecks - freeLimit) */
  chargeable: number;
}
