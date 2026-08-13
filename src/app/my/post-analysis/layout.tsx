import { requireLoginPage } from '@/lib/plan-server-guards';

// 2026-08-13 무료 하루 3회 정책: 유입/글 분석은 무료회원도 접근 가능(로그인 필요).
// 데이터 조회 한도(하루 3회)는 /api/blog/analyze 의 withAnalysisView 가 서버에서 강제한다.
export default async function PostAnalysisLayout({ children }: { children: React.ReactNode }) {
  await requireLoginPage('/my/post-analysis');
  return <>{children}</>;
}
