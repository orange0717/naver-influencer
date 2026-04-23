import InfluencerRankingView from '@/components/InfluencerRankingView';

export const metadata = {
  title: '인플루언서 순위 — N인플',
  description: 'N인플 자체 순위 — 네이버 인플루언서의 키워드 참여·순위·검색량 기반 점수 Top 50',
};

export default function InfluencerRankingPage() {
  return (
    <>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-sm text-accent font-semibold text-center">
          개발 중
        </div>
      </div>
      <InfluencerRankingView />
    </>
  );
}
