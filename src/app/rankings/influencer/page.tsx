import InfluencerRankingView from '@/components/InfluencerRankingView';

export const metadata = {
  title: '인플루언서 순위 — N인플',
  description: 'N인플 자체 순위 — 네이버 인플루언서의 키워드 참여·순위·검색량 기반 점수 Top 50',
};

export default function InfluencerRankingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <nav className="text-[11px] text-dim mb-2">
          <a href="/rankings" className="underline">랭킹</a> · 인플루언서 순위
        </nav>
        <h1 className="text-2xl font-extrabold">인플루언서 순위</h1>
        <p className="text-sm text-dim mt-1">
          N인플 자체 순위. 참여 중인 키워드의 상위 노출과 월간 검색량을 종합한 점수 기반.
        </p>
      </div>

      <InfluencerRankingView />
    </div>
  );
}
