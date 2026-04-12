import Link from 'next/link';

export default function OrangeConnectPage() {
  return (
    <div className="min-h-screen flex flex-col">

      {/* 미니 헤더 */}
      <header className="absolute top-0 left-0 right-0 z-10 px-6 md:px-10 py-5">
        <span className="text-sm font-black tracking-tight text-text/50">ORANGE CONNECT</span>
      </header>

      {/* 풀스크린 좌우 분할 */}
      <div className="flex-1 flex flex-col md:flex-row min-h-screen">

        {/* 좌측: 인플루언서 */}
        <Link href="/" className="flex-1 group relative overflow-hidden">
          <div className="absolute inset-0 bg-[#F5EDE8] group-hover:bg-[#EDE3DC] transition-colors duration-500" />
          <div className="relative h-full flex flex-col justify-between p-8 md:p-12 lg:p-16 min-h-[50vh] md:min-h-screen">
            <div className="mt-8">
              <h2 className="text-4xl md:text-5xl font-black text-text mb-5">인플루언서</h2>
              <p className="text-text/50 text-base md:text-lg leading-relaxed max-w-sm">
                크리에이터에게는<br />
                <span className="text-text font-bold">콘텐츠 가치</span>를
              </p>
            </div>
            <div className="flex items-center gap-3 group-hover:gap-5 transition-all duration-300">
              <span className="text-sm font-semibold text-text/60">자세히 보기</span>
              <div className="flex-1 h-px bg-text/15" />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text/40">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

        {/* 우측: 브랜드사 */}
        <Link href="/orangeconnect/search" className="flex-1 group relative overflow-hidden">
          <div className="absolute inset-0 bg-[#3D3230] group-hover:bg-[#4A3D3B] transition-colors duration-500" />
          <div className="relative h-full flex flex-col justify-between p-8 md:p-12 lg:p-16 min-h-[50vh] md:min-h-screen">
            <div className="mt-8">
              <h2 className="text-4xl md:text-5xl font-black text-white mb-5">브랜드사</h2>
              <p className="text-white/50 text-base md:text-lg leading-relaxed max-w-sm">
                브랜드사에게는<br />
                <span className="text-white font-bold">확실한 광고효과</span>를
              </p>
            </div>
            <div className="flex items-center gap-3 group-hover:gap-5 transition-all duration-300">
              <span className="text-sm font-semibold text-white/60">자세히 보기</span>
              <div className="flex-1 h-px bg-white/20" />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

      </div>
    </div>
  );
}
