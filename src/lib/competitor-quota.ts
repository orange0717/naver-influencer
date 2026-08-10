import { createServiceClient } from './supabase-server';
import { consumeFreeDailyQuota, getFreeDailyUsage, MEMBER_DAILY_FREE_LIMIT } from './free-quota';

export type PlanTier = 'free' | 'blogger' | 'influencer';

/**
 * 2026-08-08 프리미엄 모델 전환: 경쟁자 분석 전용 쿼터(플랜별 1/5/무제한 + 리소스 단위 중복방지)를
 * 폐지하고, 공용 "하루 5회(비회원)/10회(회원) 무료 풀"(free-quota.ts)로 통합했다.
 * PRO 이용권(blogger/influencer) 보유자는 무제한, 그 외에는 다른 무료 기능들과 합산된 전역 한도를 쓴다.
 * (이전에는 같은 경쟁자를 재조회하면 카운트하지 않았으나, 전역 합산 방식으로 바뀌며 그 구분은 없앴다.)
 * 이 모듈은 기존 호출부(경쟁자 API 2곳)의 시그니처를 유지하기 위한 얇은 래퍼다.
 */

/** 플랜별 1일 무료 한도 — PRO(blogger/influencer)는 무제한, free는 회원 공용 풀(MEMBER_DAILY_FREE_LIMIT) */
export function getCompetitorDailyLimit(plan: PlanTier): number {
  if (plan === 'free') return MEMBER_DAILY_FREE_LIMIT;
  return Infinity;
}

/** 현재 사용 내역 조회 (헤더 배지·quota API용) */
export async function getCompetitorUsage(userKey: string): Promise<{ count: number }> {
  const usage = await getFreeDailyUsage({ isPro: false, userId: userKey });
  return { count: usage.used };
}

/**
 * 경쟁자 분석 시도 — 전역 무료 풀 1회 소모 (PRO면 무제한 통과)
 * @returns allowed=true 시 분석 진행 가능
 */
export async function tryConsumeCompetitor(
  userKey: string,
  competitorId: string,
  plan: PlanTier,
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const isPro = plan !== 'free';
  const result = await consumeFreeDailyQuota({
    actionId: 'competitor_analyze',
    isPro,
    userId: userKey,
  });
  return { allowed: result.allowed, count: result.used, limit: result.limit };
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
