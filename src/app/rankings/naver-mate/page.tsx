import NaverMateRankingView from '@/components/NaverMateRankingView';

export const metadata = {
  title: '네이버 메이트 랭킹 — N인플',
  description: '네이버 메이트(AI 브리핑 인용수 기반 크리에이터) 분야별 랭킹. 매일 자동 수집.',
};

export default function NaverMateRankingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">네이버 메이트 랭킹</h1>
        <p className="text-sm text-dim mt-1">
          네이버 공식 AI 펠로우십 프로그램 &apos;네이버 메이트&apos;의 분야별 AI 브리핑 누적 인용수 랭킹입니다.
        </p>
      </div>
      <NaverMateRankingView />
    </div>
  );
}
