import { requireLoginPage } from '@/lib/plan-server-guards';

// 2026-08-13 무료 하루 3회 정책: 내 키워드 순위는 무료회원도 접근 가능(로그인 필요).
// 데이터 조회 한도(하루 3회)는 /api/my/keyword-ranking-state 의 withAnalysisView 가 서버에서 강제한다.
export default async function KeywordRankingLayout({ children }: { children: React.ReactNode }) {
  await requireLoginPage('/my/keyword-ranking');
  return <>{children}</>;
}
