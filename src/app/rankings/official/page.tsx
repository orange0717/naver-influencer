import OfficialRankingView from '@/components/OfficialRankingView';

export const metadata = {
  title: '네이버 인플루언서 공식순위 — N인플',
  description: '네이버가 발표하는 공식 카테고리별 인플루언서 순위. 주 1회 업데이트.',
};

export default function OfficialRankingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">네이버 인플루언서 공식순위</h1>
        <p className="text-sm text-dim mt-1">
          네이버가 발표하는 공식 카테고리별 인플루언서 순위입니다. 주 1회 업데이트되며, 인플루언서 플랜 이상에서 이용 가능합니다.
        </p>
      </div>
      <OfficialRankingView />
    </div>
  );
}
