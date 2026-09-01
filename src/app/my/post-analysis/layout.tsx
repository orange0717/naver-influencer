import { requireLoginPage } from '@/lib/plan-server-guards';

// 유입/글 분석은 무료 기능이라 회원이면 접근 가능하다(로그인 필요).
// 다만 /api/blog/analyze 는 호출마다 네이버를 실제로 긁으므로 비용 방어선으로
// 비회원 3회 · 회원 10회 한도가 남아 있다(withAnalysisView 가 서버에서 강제).
export default async function PostAnalysisLayout({ children }: { children: React.ReactNode }) {
  await requireLoginPage('/my/post-analysis');
  return <>{children}</>;
}
