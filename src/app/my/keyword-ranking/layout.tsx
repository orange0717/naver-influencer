import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

// 등급은 lib/plans.ts 의 'my.keyword-ranking'(BLOGGER)이 정본이다.
// 무료회원 하루 3회는 /api/my/keyword-ranking-state 의 withAnalysisView 가 그대로 강제한다.
export default async function KeywordRankingLayout({ children }: { children: React.ReactNode }) {
  const gate = await checkFeaturePage('my.keyword-ranking', '/my/keyword-ranking');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <>{children}</>;
}
