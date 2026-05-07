export const metadata = {
  title: '랭킹 — N인플',
  description: '랭킹 기능은 현재 제공하지 않습니다.',
};

export default function RankingsHubPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
      <h1 className="text-2xl font-extrabold">랭킹</h1>
      <p className="text-sm text-dim leading-relaxed">
        현재 제공 중인 랭킹 기능이 없습니다. 인플루언서 정보는{' '}
        <a href="/influencers" className="text-accent underline hover:text-accent-hover">인플루언서 리스트</a>
        에서 확인하실 수 있습니다.
      </p>
    </div>
  );
}
