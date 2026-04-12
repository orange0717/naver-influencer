import Link from 'next/link';

export default function OrangeConnectPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-16 px-4">

      {/* 타이틀 */}
      <div className="text-center mb-12">
        <p className="text-accent text-sm font-bold tracking-wider mb-3">ORANGE CONNECT</p>
        <h1 className="text-3xl md:text-4xl font-black leading-tight">
          인플루언서와 브랜드를 연결합니다
        </h1>
      </div>

      {/* 2개 카드 가로 배치 */}
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 인플루언서 카드 */}
        <Link href="/" className="block group">
          <div className="bg-surface border border-border rounded-2xl p-8 h-full hover:border-accent/40 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span className="text-accent text-sm font-semibold group-hover:underline">
                자세히 보기 →
              </span>
            </div>
            <h2 className="text-2xl font-black mb-3">인플루언서</h2>
            <p className="text-dim text-sm leading-relaxed">
              키워드챌린지 순위를 확인하고,<br />
              나의 영향력을 데이터로 증명하세요.
            </p>
          </div>
        </Link>

        {/* 브랜드사 카드 */}
        <Link href="/orangeconnect/search" className="block group">
          <div className="bg-surface border border-border rounded-2xl p-8 h-full hover:border-accent/40 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <span className="text-accent text-sm font-semibold group-hover:underline">
                자세히 보기 →
              </span>
            </div>
            <h2 className="text-2xl font-black mb-3">브랜드사</h2>
            <p className="text-dim text-sm leading-relaxed">
              검증된 인플루언서/블로거를 찾고,<br />
              캠페인을 등록해 자동으로 매칭하세요.
            </p>
          </div>
        </Link>

      </div>
    </div>
  );
}
