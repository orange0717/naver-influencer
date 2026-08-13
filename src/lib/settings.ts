/**
 * settings.ts — 관리자 정책설정 접근 계층 (스펙 §10 "하드코딩 금지").
 *
 * 정책값(무료 한도·N캐시 적립률·기능별 크레딧·크레딧 상품가·월 지급 크레딧 등)을
 * app_settings(migration-150) 테이블에서 읽되, 값이 없거나 유효하지 않으면 코드 기본값으로
 * 폴백한다. 즉 테이블이 비어 있으면 기존 동작과 100% 동일 → 무중단 도입.
 *
 * - 읽기는 service_role RPC(get_app_settings)로 전체를 한 번에 가져와 프로세스 내 캐시(TTL 60s).
 *   서버리스라 인스턴스별 캐시지만, 콜드스타트 후 60초마다 최대 1회 갱신 → 핫패스 부담 없음.
 * - DB 장애/미적용 시에도 항상 기본값으로 폴백(fail-open) — 정책 조회 실패가 기능을 막지 않는다.
 * - 크레딧 과금 하드게이트(credit-gate.ts)만은 별도로 env CREDITS_ENABLED 를 존중한다.
 *
 * ⚠️ credit-config.ts / free-quota.ts 의 상수는 "기본값(default)"으로 남는다. import 는 이 방향만
 *    허용(settings → credit-config). free-quota → settings 는 가능하나 settings → free-quota 는 금지(순환).
 */
import { createServiceClient } from './supabase-server';
import {
  CREDIT_COSTS,
  CREDIT_PACKAGES,
  PLAN_MONTHLY_CREDITS,
  SIGNUP_BONUS_CREDITS,
  type CreditFeature,
  type CreditPackage,
} from './credit-config';

// ── 코드 기본값 (app_settings 미설정 시 폴백). free-quota.ts 상수와 동일 값 유지. ──
export const DEFAULT_FREE_DAILY_LIMIT_MEMBER = 3;
export const DEFAULT_FREE_DAILY_LIMIT_ANON = 3;
export const DEFAULT_NCASH_ACCRUAL_RATE = 0.1; // 결제금액의 10%

export const SETTING_KEYS = {
  freeDailyLimitMember: 'free_daily_limit_member',
  freeDailyLimitAnon: 'free_daily_limit_anon',
  ncashAccrualRate: 'ncash_accrual_rate',
  creditCosts: 'credit_costs',
  creditPackages: 'credit_packages',
  planMonthlyCredits: 'plan_monthly_credits',
  signupBonusCredits: 'signup_bonus_credits',
  creditsEnabled: 'credits_enabled',
} as const;

type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// ── 캐시 ──
const CACHE_TTL_MS = 60_000;
let cache: Record<string, unknown> | null = null;
let cacheAt = 0;
let inflight: Promise<Record<string, unknown>> | null = null;

async function loadAll(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const supa = createServiceClient();
      const { data, error } = await supa.rpc('get_app_settings');
      if (error) {
        console.error('[settings] get_app_settings failed:', error.message);
        // 캐시가 있으면 유지, 없으면 빈 객체(→ 전부 기본값 폴백)
        cache = cache ?? {};
        cacheAt = now;
        return cache;
      }
      const map: Record<string, unknown> = {};
      for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
        map[row.key] = row.value;
      }
      cache = map;
      cacheAt = now;
      return map;
    } catch (err) {
      console.error('[settings] loadAll unexpected:', err);
      cache = cache ?? {};
      cacheAt = now;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 캐시 무효화 — 관리자 설정 저장 직후 호출해 즉시 반영. */
export function invalidateSettingsCache(): void {
  cache = null;
  cacheAt = 0;
}

async function raw(key: SettingKey): Promise<unknown> {
  const all = await loadAll();
  return all[key];
}

// ── 유효성 헬퍼: 잘못된 관리자 값이 시스템을 깨지 않도록 항상 폴백 ──
function posInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
function rate01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

// ── 공개 getter ──

/** 무료 하루 이용 횟수. isMember=true → 회원 한도, false → 비회원 한도. */
export async function getFreeDailyLimit(isMember: boolean): Promise<number> {
  const key = isMember ? SETTING_KEYS.freeDailyLimitMember : SETTING_KEYS.freeDailyLimitAnon;
  const def = isMember ? DEFAULT_FREE_DAILY_LIMIT_MEMBER : DEFAULT_FREE_DAILY_LIMIT_ANON;
  return posInt(await raw(key), def);
}

/** N캐시 적립률 (0~1). 기본 0.10. */
export async function getNcashAccrualRate(): Promise<number> {
  return rate01(await raw(SETTING_KEYS.ncashAccrualRate), DEFAULT_NCASH_ACCRUAL_RATE);
}

/** 기능별 크레딧 차감량. app_settings.credit_costs[feature] override, 없으면 CREDIT_COSTS 기본값. */
export async function getCreditCost(feature: CreditFeature): Promise<number> {
  const override = (await raw(SETTING_KEYS.creditCosts)) as Record<string, unknown> | undefined;
  if (override && feature in override) {
    return posInt(override[feature], CREDIT_COSTS[feature] ?? 0);
  }
  return CREDIT_COSTS[feature] ?? 0;
}

/** 크레딧 충전 상품 목록. override 배열이 유효하면 사용, 아니면 CREDIT_PACKAGES 기본값. */
export async function getCreditPackages(): Promise<CreditPackage[]> {
  const override = await raw(SETTING_KEYS.creditPackages);
  if (Array.isArray(override)) {
    const valid = override.filter(
      (p): p is CreditPackage =>
        !!p &&
        typeof p.key === 'string' &&
        Number.isFinite(Number(p.credits)) &&
        Number(p.credits) > 0 &&
        Number.isFinite(Number(p.amount)) &&
        Number(p.amount) >= 0 &&
        typeof p.name === 'string',
    );
    if (valid.length > 0) return valid;
  }
  return CREDIT_PACKAGES;
}

export async function getCreditPackage(key: string): Promise<CreditPackage | null> {
  return (await getCreditPackages()).find((p) => p.key === key) ?? null;
}

/** 플랜 tier('blogger'|'influencer')별 월 지급 크레딧. */
export async function getPlanMonthlyCredits(tier: string): Promise<number> {
  const override = (await raw(SETTING_KEYS.planMonthlyCredits)) as Record<string, unknown> | undefined;
  const def = PLAN_MONTHLY_CREDITS[tier] ?? 0;
  if (override && tier in override) return posInt(override[tier], def);
  return def;
}

/** 신규 가입 보너스 크레딧. */
export async function getSignupBonusCredits(): Promise<number> {
  return posInt(await raw(SETTING_KEYS.signupBonusCredits), SIGNUP_BONUS_CREDITS);
}

/**
 * 크레딧 과금 활성 여부(정책값). 실제 하드게이트는 credit-gate.ts 가 env CREDITS_ENABLED 와
 * OR 로 결합해 판단한다 — 둘 중 하나라도 켜져 있으면 활성. (부주의한 활성화 방지: 기본 false)
 */
export async function getCreditsEnabledSetting(): Promise<boolean> {
  const v = await raw(SETTING_KEYS.creditsEnabled);
  return v === true || v === 'true';
}

// ── 관리자용: 유효 정책값 전체 + override 여부 스냅샷 ──
export interface EffectiveSettings {
  free_daily_limit_member: number;
  free_daily_limit_anon: number;
  ncash_accrual_rate: number;
  credit_costs: Record<string, number>;
  credit_packages: CreditPackage[];
  plan_monthly_credits: Record<string, number>;
  signup_bonus_credits: number;
  credits_enabled: boolean;
  /** 각 key 가 DB에서 override 됐는지(true) 코드 기본값인지(false) */
  _overridden: Record<string, boolean>;
}

export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  const all = await loadAll();
  const has = (k: string) => Object.prototype.hasOwnProperty.call(all, k);

  const creditCosts: Record<string, number> = {};
  for (const f of Object.keys(CREDIT_COSTS) as CreditFeature[]) {
    creditCosts[f] = await getCreditCost(f);
  }
  const planCredits: Record<string, number> = {};
  for (const t of Object.keys(PLAN_MONTHLY_CREDITS)) {
    planCredits[t] = await getPlanMonthlyCredits(t);
  }

  return {
    free_daily_limit_member: await getFreeDailyLimit(true),
    free_daily_limit_anon: await getFreeDailyLimit(false),
    ncash_accrual_rate: await getNcashAccrualRate(),
    credit_costs: creditCosts,
    credit_packages: await getCreditPackages(),
    plan_monthly_credits: planCredits,
    signup_bonus_credits: await getSignupBonusCredits(),
    credits_enabled: await getCreditsEnabledSetting(),
    _overridden: {
      free_daily_limit_member: has(SETTING_KEYS.freeDailyLimitMember),
      free_daily_limit_anon: has(SETTING_KEYS.freeDailyLimitAnon),
      ncash_accrual_rate: has(SETTING_KEYS.ncashAccrualRate),
      credit_costs: has(SETTING_KEYS.creditCosts),
      credit_packages: has(SETTING_KEYS.creditPackages),
      plan_monthly_credits: has(SETTING_KEYS.planMonthlyCredits),
      signup_bonus_credits: has(SETTING_KEYS.signupBonusCredits),
      credits_enabled: has(SETTING_KEYS.creditsEnabled),
    },
  };
}

/** 단일 key 저장(관리자 API). 저장 후 캐시 무효화. */
export async function setSetting(key: SettingKey, value: unknown, updatedBy?: string): Promise<void> {
  const supa = createServiceClient();
  const { error } = await supa.rpc('set_app_setting', {
    p_key: key,
    p_value: value,
    p_updated_by: updatedBy ?? null,
  });
  if (error) throw new Error(`set_app_setting failed: ${error.message}`);
  invalidateSettingsCache();
}
