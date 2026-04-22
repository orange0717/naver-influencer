import { Redis } from '@upstash/redis';
import { createServiceClient } from './supabase-server';

export type PlanTier = 'free' | 'blogger' | 'influencer';

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = hasRedis ? Redis.fromEnv() : null;

// 인메모리 폴백 (로컬 개발용)
const memStore = new Map<string, { ids: Set<string>; expiresAt: number }>();

/** 플랜별 1일 경쟁자 분석 허용 횟수 */
export function getCompetitorDailyLimit(plan: PlanTier): number {
  if (plan === 'influencer') return Infinity;
  if (plan === 'blogger') return 5;
  return 1;
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function getTodayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** KST 기준 다음 자정까지 남은 초 */
function getSecondsUntilKSTMidnight(): number {
  const nowMs = Date.now();
  const kstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  const kstMidnight = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((kstMidnight - kstNow.getTime()) / 1000));
}

function getKey(userKey: string): string {
  return `competitor_daily:${userKey}:${getTodayKST()}`;
}

/** 현재 사용 내역 조회 */
export async function getCompetitorUsage(
  userKey: string,
): Promise<{ count: number; ids: string[] }> {
  const key = getKey(userKey);
  if (redis) {
    const ids = await redis.smembers(key);
    return { count: ids.length, ids };
  }
  const entry = memStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    memStore.delete(key);
    return { count: 0, ids: [] };
  }
  return { count: entry.ids.size, ids: Array.from(entry.ids) };
}

/**
 * 경쟁자 분석 시도 — 이미 본 competitorId면 카운트하지 않고 통과
 * @returns allowed=true 시 분석 진행 가능
 */
export async function tryConsumeCompetitor(
  userKey: string,
  competitorId: string,
  plan: PlanTier,
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = getCompetitorDailyLimit(plan);
  if (!isFinite(limit)) {
    return { allowed: true, count: 0, limit: Infinity };
  }

  const key = getKey(userKey);
  const ttl = getSecondsUntilKSTMidnight();

  if (redis) {
    const alreadyMember = await redis.sismember(key, competitorId);
    if (alreadyMember) {
      const count = await redis.scard(key);
      return { allowed: true, count, limit };
    }
    const currentCount = await redis.scard(key);
    if (currentCount >= limit) {
      return { allowed: false, count: currentCount, limit };
    }
    await redis.sadd(key, competitorId);
    if (currentCount === 0) await redis.expire(key, ttl);
    return { allowed: true, count: currentCount + 1, limit };
  }

  // 인메모리 폴백
  const now = Date.now();
  let entry = memStore.get(key);
  if (!entry || entry.expiresAt < now) {
    entry = { ids: new Set(), expiresAt: now + ttl * 1000 };
    memStore.set(key, entry);
  }
  if (entry.ids.has(competitorId)) {
    return { allowed: true, count: entry.ids.size, limit };
  }
  if (entry.ids.size >= limit) {
    return { allowed: false, count: entry.ids.size, limit };
  }
  entry.ids.add(competitorId);
  return { allowed: true, count: entry.ids.size, limit };
}

/**
 * 쿠키 유저(naver_id/blog_id) 기반 플랜 티어 조회
 * users.subscription_plan + subscription_expires_at 기반
 */
export async function getPlanTierByCookieUser(cookieUser: {
  id: string;
  type: 'blogger' | 'influencer';
}): Promise<PlanTier> {
  const supabase = createServiceClient();
  let userRow: {
    subscription_plan: string | null;
    subscription_expires_at: string | null;
  } | null = null;

  if (cookieUser.type === 'blogger') {
    const { data } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('blog_id', cookieUser.id)
      .limit(1)
      .maybeSingle();
    userRow = data;
  } else {
    // influencer: naver_id → influencers.id → users.linked_influencer_id
    const { data: inf } = await supabase
      .from('influencers')
      .select('id')
      .eq('naver_id', cookieUser.id)
      .limit(1)
      .maybeSingle();
    if (inf) {
      const { data } = await supabase
        .from('users')
        .select('subscription_plan, subscription_expires_at')
        .eq('linked_influencer_id', inf.id)
        .limit(1)
        .maybeSingle();
      userRow = data;
    }
    if (!userRow) {
      // unified 타입 폴백: blog_id = naver_id 인 경우
      const { data } = await supabase
        .from('users')
        .select('subscription_plan, subscription_expires_at')
        .eq('blog_id', cookieUser.id)
        .limit(1)
        .maybeSingle();
      userRow = data;
    }
  }

  if (!userRow?.subscription_plan) return 'free';
  if (
    !userRow.subscription_expires_at ||
    new Date(userRow.subscription_expires_at) < new Date()
  ) {
    return 'free';
  }
  const plan = userRow.subscription_plan.toUpperCase();
  if (plan.includes('INFLUENCER')) return 'influencer';
  if (plan.includes('BLOGGER')) return 'blogger';
  return 'free';
}
