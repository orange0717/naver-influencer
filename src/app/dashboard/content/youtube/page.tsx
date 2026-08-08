import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout, createServiceClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import ContentAnalysisClient from './ContentAnalysisClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '유튜브 콘텐츠 분석 — N인플',
  description: '유튜브 영상 URL로 콘텐츠 구조·톤·점수를 AI가 분석하고 컬러 팔레트를 추출합니다',
};

export default async function ContentYoutubeAnalysisPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-title text-xl font-bold text-text">유튜브 콘텐츠 분석</h1>
        <p className="text-sm text-dim leading-relaxed">
          이 기능은 가입 회원 전용입니다. 로그인하면 이 페이지에서 바로 이용할 수 있습니다.
        </p>
        <a
          href="/auth/login?redirect=/dashboard/content/youtube"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
        >
          로그인
        </a>
      </div>
    );
  }

  if (!isAdmin(authUser.id)) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('auth_id', authUser.id)
      .single();
    const expires = data?.subscription_expires_at;
    const isInfluencer =
      data?.subscription_plan === 'INFLUENCER' &&
      !!expires &&
      new Date(expires).getTime() > Date.now();
    if (!isInfluencer) redirect('/subscribe?required=influencer');
  }

  return <ContentAnalysisClient />;
}
