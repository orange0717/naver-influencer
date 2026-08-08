import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import AiConsultantClient from './AiConsultantClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'N인플 AI — N인플',
  description: '마케팅·콘텐츠 고민을 입력하면 N인플의 어떤 분석 도구가 도움이 될지 AI가 추천해드립니다.',
};

export default async function AiConsultantPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-title text-xl font-bold text-text">N인플 AI</h1>
        <p className="text-sm text-dim leading-relaxed">
          이 기능은 가입 회원 전용입니다. 로그인하면 이 페이지에서 바로 이용할 수 있습니다.
        </p>
        <a
          href="/auth/login?redirect=/dashboard/ai-consultant"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
        >
          로그인
        </a>
      </div>
    );
  }

  return <AiConsultantClient />;
}
