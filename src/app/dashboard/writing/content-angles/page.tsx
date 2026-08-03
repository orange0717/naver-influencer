import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout, createServiceClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import ContentAnglesClient from './ContentAnglesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '글감찾기 — N인플',
  description: '키워드 하나로 사람들이 궁금해하는 질문과 추천 글감을 AI가 찾아드립니다',
};

export default async function ContentAnglesPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-title text-xl font-bold text-text">글감찾기</h1>
        <p className="text-sm text-dim leading-relaxed">
          이 기능은 가입 회원 전용입니다. 로그인하면 이 페이지에서 바로 이용할 수 있습니다.
        </p>
        <a
          href="/auth/login?redirect=/dashboard/writing/content-angles"
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

  return <ContentAnglesClient />;
}
