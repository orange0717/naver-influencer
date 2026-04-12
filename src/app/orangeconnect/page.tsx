import Link from 'next/link';

export default function OrangeConnectPage() {
  return (
    <div className="min-h-screen flex flex-col">

      {/* 미니 헤더 */}
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <Link href="/orangeconnect" className="text-lg font-black tracking-tight text-text">
          ORANGE CONNECT
        </Link>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col md:flex-row">

        {/* 좌측: 히어로 */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-10 lg:px-16 py-12 md:py-0">
          <p className="text-base md:text-lg text-text/80 leading-relaxed mb-2">
            인플루언서, 브랜드 협업의 시작
          </p>
          <p className="text-base md:text-lg text-text/80 leading-relaxed mb-6">
            오렌지가 만든 인플루언서 비즈니스 플랫폼
          </p>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none">
            ORANGE<br />CONNECT
          </h1>
        </div>

        {/* 우측: 2개 카드 */}
        <div className="w-full md:w-[420px] lg:w-[480px] flex flex-col shrink-0">

          {/* 인플루언서 카드 (다크) */}
          <Link href="/" className="block flex-1 group">
            <div className="h-full bg-[#2D2D2D] text-white p-8 md:p-10 flex flex-col justify-between min-h-[240px] md:min-h-0">
              <div>
                <h2 className="text-3xl md:text-4xl font-black mb-4">인플루언서</h2>
                <p className="text-white/70 text-sm md:text-base leading-relaxed">
                  나와 잘 맞는 브랜드와 함께<br />
                  제휴 수익을 만들고 싶다면?
                </p>
              </div>
              <div className="flex items-center gap-3 mt-8">
                <span className="text-sm font-semibold">자세히 보기</span>
                <div className="flex-1 h-px bg-white/30" />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-1 transition-transform">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>

          {/* 브랜드사 카드 (액센트) */}
          <Link href="/orangeconnect/search" className="block flex-1 group">
            <div className="h-full bg-accent text-white p-8 md:p-10 flex flex-col justify-between min-h-[240px] md:min-h-0">
              <div>
                <h2 className="text-3xl md:text-4xl font-black mb-4">브랜드사</h2>
                <p className="text-white/80 text-sm md:text-base leading-relaxed">
                  인플루언서 제휴,<br />
                  성공적으로 진행하고 싶다면?
                </p>
              </div>
              <div className="flex items-center gap-3 mt-8">
                <span className="text-sm font-semibold">자세히 보기</span>
                <div className="flex-1 h-px bg-white/40" />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-1 transition-transform">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>

        </div>
      </div>

      {/* 하단 카피라이트 */}
      <footer className="px-6 md:px-10 py-4">
        <p className="text-[11px] text-dim">Orange Connect by 오렌지도서관</p>
      </footer>

    </div>
  );
}
