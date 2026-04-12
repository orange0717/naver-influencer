import Link from 'next/link';

export default function OrangeConnectPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-10 md:gap-16 items-center">

        {/* ── 좌측: 히어로 ── */}
        <div>
          <p className="text-accent text-sm font-bold tracking-wider mb-4">ORANGE CONNECT</p>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            크리에이터와<br />
            브랜드를<br />
            연결합니다
          </h1>
          <p className="text-dim text-base md:text-lg leading-relaxed">
            네이버 인플루언서/블로거의 실제 순위 데이터를 기반으로<br className="hidden md:block" />
            신뢰할 수 있는 마케팅 파트너를 만나보세요.
          </p>
        </div>

        {/* ── 우측: 2개 카드 ── */}
        <div className="space-y-5">

          {/* 크리에이터 카드 */}
          <Link href="/" className="block group">
            <div className="bg-surface border border-border rounded-2xl p-8 hover:border-accent/40 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span className="text-accent text-sm font-semibold group-hover:underline">
                  자세히 보기 →
                </span>
              </div>
              <h2 className="text-2xl font-black mb-2">크리에이터</h2>
              <p className="text-dim text-sm leading-relaxed">
                키워드챌린지 순위를 확인하고,<br />
                나의 영향력을 데이터로 증명하세요.
              </p>
            </div>
          </Link>

          {/* 광고주 카드 */}
          <Link href="/orangeconnect/search" className="block group">
            <div className="bg-surface border border-border rounded-2xl p-8 hover:border-accent/40 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <span className="text-accent text-sm font-semibold group-hover:underline">
                  자세히 보기 →
                </span>
              </div>
              <h2 className="text-2xl font-black mb-2">광고주</h2>
              <p className="text-dim text-sm leading-relaxed">
                검증된 인플루언서/블로거를 찾고,<br />
                캠페인을 등록해 자동으로 매칭하세요.
              </p>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
}
