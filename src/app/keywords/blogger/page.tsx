export default function BloggerKeywordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">블로그 키워드 분석</h1>
        <p className="text-sm text-dim mt-1">네이버 검색 키워드의 검색량과 경쟁도를 분석합니다</p>
      </div>

      <div className="text-center py-20 bg-surface border border-border rounded-2xl">
        <div className="w-14 h-14 mx-auto rounded-xl bg-accent/10 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <p className="text-lg font-bold text-text mb-2">곧 출시됩니다</p>
        <p className="text-sm text-dim leading-relaxed">
          네이버 검색 API 기반 키워드 검색량/경쟁도 분석 기능을<br />
          준비하고 있습니다.
        </p>
        <p className="text-xs text-dim/60 mt-4">월 5,500원 블로거 요금제에 포함</p>
      </div>
    </div>
  );
}
