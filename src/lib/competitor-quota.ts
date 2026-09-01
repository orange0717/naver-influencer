import { createServiceClient } from './supabase-server';

export type PlanTier = 'free' | 'blogger' | 'influencer';

/**
 * 경쟁자 분석은 예비 인플루언서 이용권부터 열리는 기능이다(plans.ts: competitor.analysis).
 * 2026-09-01 이전에는 무료 회원에게도 공용 무료 풀에서 하루 몇 회를 내줬는데, 이용권 페이지는
 * 무료 칸을 비워 두고 있어 서로 어긋났다. 이제 무료는 0회 · 이용권 보유자는 무제한이라
 * 셀 것이 없어 카운터를 두지 않는다.
 */
export function competitorAllowed(plan: PlanTier): boolean {
  return plan !== 'free';
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
