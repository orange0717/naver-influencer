import { createServiceClient } from './supabase-server';
import { toPlanKey, type PlanKey } from './plans';

/**
 * 경쟁자 분석은 Pro 플랜부터 열리는 기능이다(plans.ts: competitor.analysis).
 * 2026-09-01 이전에는 무료 회원에게도 공용 무료 풀에서 하루 몇 회를 내줬는데, 이용권 페이지는
 * 무료 칸을 비워 두고 있어 서로 어긋났다. 이제 무료는 0회 · 이용권 보유자는 무제한이라
 * 셀 것이 없어 카운터를 두지 않는다.
 */
export function competitorAllowed(plan: PlanKey): boolean {
  return plan !== 'free';
}

/**
 * 쿠키 유저(naver_id/blog_id) 기반 등급 조회.
 * users.subscription_plan + subscription_expires_at 기반.
 *
 * 🚨 cookieUser.type 의 'blogger' | 'influencer' 는 결제 등급이 아니라 **네이버 인플루언서
 * 선정 여부**(도메인 정체성, auth.ts)다. 반환값 PlanKey 와 글자가 비슷하지만 다른 축이므로
 * 둘을 섞지 말 것.
 */
export async function getPlanTierByCookieUser(cookieUser: {
  id: string;
  type: 'blogger' | 'influencer';
}): Promise<PlanKey> {
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
  // 🚨 부분일치(includes)는 의도적으로 유지한다. toPlanKey 의 완전일치와 달리
  // 'INFLUENCER_3M' 같은 값도 받아 주는데, 여기만 그렇게 관대했다. 등급 명칭 변경
  // 작업에서 완전일치로 좁히면 그런 행이 있을 경우 권한이 조용히 사라지므로 손대지 않았다.
  const plan = userRow.subscription_plan.toUpperCase();
  if (plan.includes('INFLUENCER')) return 'max';
  if (plan.includes('BLOGGER')) return 'pro';
  return 'free';
}
