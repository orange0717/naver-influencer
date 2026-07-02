import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { getPaywallContext } from '@/lib/admin';

/** 예비 인플루언서(BLOGGER) 이상 — 활성 유료 구독 또는 관리자 */
export async function requireBloggerPlusPage(loginRedirectPath: string) {
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(loginRedirectPath)}`);
  }
  const ctx = await getPaywallContext(user.id, user.email);
  if (ctx.isAdminUser) return;
  if (!ctx.hasActivePaidPlan) {
    redirect('/subscribe?highlight=blogger');
  }
}

/** 로그인만 필요 (구독 플랜 무관, 무료 공개 페이지) */
export async function requireLoginPage(loginRedirectPath: string) {
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(loginRedirectPath)}`);
  }
}

/** 인플루언서 플랜 전용 페이지 */
export async function requireInfluencerPlusPage(loginRedirectPath: string) {
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(loginRedirectPath)}`);
  }
  const ctx = await getPaywallContext(user.id, user.email);
  if (ctx.isAdminUser) return;
  if (!ctx.hasActivePaidPlan || ctx.plan !== 'INFLUENCER') {
    redirect('/subscribe?highlight=influencer');
  }
}
