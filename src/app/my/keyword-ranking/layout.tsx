import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

// 등급은 lib/plans.ts 의 'my.keyword-ranking'(BLOGGER)이 정본이다.
// 데이터 API 는 미들웨어의 /api/my 유료 게이트가 막는다(예전의 X-View-Token 우회는 걷어냈다).
export default async function KeywordRankingLayout({ children }: { children: React.ReactNode }) {
  const gate = await checkFeaturePage('my.keyword-ranking', '/my/keyword-ranking');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <>{children}</>;
}
