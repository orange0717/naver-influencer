import BlogQualityChecker from '@/components/BlogQualityChecker';

export const metadata = {
  title: '블로그 품질지수 — N인플',
  description: '네이버 블로그의 품질지수를 확인하세요. C-rank · D.I.A. · D.I.A.+ 종합 결과 기반 추정치.',
};

export default function BlogQualityPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">블로그 품질지수</h1>
        <p className="text-sm text-dim mt-1">
          블로그 품질지수를 확인하세요. 최근 포스트의 검색 노출을 측정해 C-rank · D.I.A. · D.I.A.+ 종합 결과를 근사합니다.
        </p>
      </div>

      <BlogQualityChecker />

      <p className="text-[11px] text-dim text-center">
        블로거/인플루언서 순위는 <a href="/rankings" className="underline">랭킹 페이지</a>에서 확인하세요.
      </p>
    </div>
  );
}
