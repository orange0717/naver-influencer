import BloggerRankingView from '@/components/BloggerRankingView';

export const metadata = {
  title: '예비 인플루언서 순위 — N인플',
  description: '네이버 예비 인플루언서 종합 순위 Top 50 · 내 블로그 순위 조회',
};

export default function BloggerRankingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <nav className="text-[11px] text-dim mb-2">
          <a href="/rankings" className="underline">랭킹</a> · 예비 인플루언서 순위
        </nav>
        <h1 className="text-2xl font-extrabold">예비 인플루언서 순위</h1>
        <p className="text-sm text-dim mt-1">
          네이버 예비 인플루언서 활동 점수 기반 종합 순위. 내 블로그 순위도 입력해서 확인할 수 있습니다.
        </p>
      </div>

      <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-sm text-accent font-semibold text-center">
        개발 중
      </div>

      <BloggerRankingView />

      <p className="text-[11px] text-dim text-center">
        순위는 주 1회 갱신됩니다. 수집·점수 산정 방식은 <a href="/bot-info" className="underline">봇 정보</a>에서 확인하세요.
      </p>
    </div>
  );
}
