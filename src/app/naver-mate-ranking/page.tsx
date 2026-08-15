import NaverMateRankingView from '@/components/NaverMateRankingView';

export const metadata = {
  title: '네이버 메이트 — N인플',
  description: '네이버 메이트의 분야별 AI 브리핑 인용수 랭킹. 공식 분야 체계 기준으로 매일 자동 수집.',
};

export default function NaverMateRankingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="type-page-title">네이버 메이트</h1>
        <p className="text-sm text-dim mt-1">
          네이버 메이트의 분야별 AI 브리핑 누적 인용수를 집계한 메이트 랭킹입니다. 분야 체계는 네이버 메이트 공식 카테고리를 따릅니다.
        </p>
      </div>
      <NaverMateRankingView />
    </div>
  );
}
