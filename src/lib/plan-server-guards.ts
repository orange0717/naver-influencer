import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';
import { FEATURES, planAtLeast, toPlanKey, SUBSCRIBE_PATH, type FeatureKey, type PlanKey } from '@/lib/plans';

/**
 * 비로그인은 회원 전용 모달로 보낸다.
 * 로그인 폼만 띄우면 계정이 없는 첫 방문자에게 막다른 길이 된다
 * (2026-08-28 오렌지 승인 "C를 B로 합치기").
 */
function bounceToMemberGate(loginRedirectPath: string): never {
  redirect(`/?memberOnly=1&redirect=${encodeURIComponent(loginRedirectPath)}`);
}

/** 로그인만 필요 (구독 플랜 무관, 무료 공개 페이지) */
export async function requireLoginPage(loginRedirectPath: string) {
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) bounceToMemberGate(loginRedirectPath);
}

/**
 * 기능에 필요한 등급을 lib/plans.ts 에서 읽어 판정만 돌려준다.
 *
 * 비로그인은 여기서 회원 전용 모달로 보낸다(볼 화면 자체가 없다). 등급이 모자란 경우는
 * 리다이렉트하지 않고 allowed:false 를 돌려주므로, 호출한 페이지가 FeatureLocked 안내를
 * 화면 안에 띄울 수 있다 (2026-09-01 오렌지 결정 "화면 안에서 안내").
 */
export async function checkFeaturePage(
  feature: FeatureKey,
  loginRedirectPath: string,
): Promise<{ allowed: boolean; required: PlanKey }> {
  const def = FEATURES[feature];
  if (!def) {
    console.error(`[checkFeaturePage] 등록되지 않은 기능 키: ${feature}`);
    return { allowed: true, required: 'FREE' };
  }

  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    if (def.allowAnonymous) return { allowed: true, required: def.minPlan };
    bounceToMemberGate(loginRedirectPath);
  }

  const required = def.minPlan;
  if (required === 'FREE') return { allowed: true, required };

  const ctx = await getPaywallContext(user.id, user.email);
  if (ctx.isAdminUser) return { allowed: true, required };

  // hasActivePaidPlan 은 만료 여부만 답하므로 등급 비교 전에 먼저 본다.
  const current = ctx.hasActivePaidPlan ? toPlanKey(ctx.plan) : 'FREE';
  return { allowed: planAtLeast(current, required), required };
}

/**
 * 화면 안에 안내를 띄울 자리가 없는 곳(레이아웃 등)에서 쓰는 강제 버전.
 * 화면을 그릴 수 있는 페이지라면 checkFeaturePage + FeatureLocked 를 쓴다.
 */
export async function requireFeaturePage(feature: FeatureKey, loginRedirectPath: string) {
  const { allowed, required } = await checkFeaturePage(feature, loginRedirectPath);
  if (!allowed) {
    redirect(`${SUBSCRIBE_PATH}?required=${required.toLowerCase()}`);
  }
}
