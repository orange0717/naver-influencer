import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '오렌지커넥트 — 인플루언서·브랜드 매칭',
  description: '오렌지커넥트에서 인플루언서는 콘텐츠 가치를, 브랜드사는 확실한 광고효과를 얻는 체험단·협찬 캠페인 매칭 서비스를 이용할 수 있습니다.',
  alternates: { canonical: 'https://ninfle.kr/orangeconnect' },
  openGraph: {
    title: '오렌지커넥트 — N인플',
    description: '인플루언서와 브랜드사를 연결하는 체험단·협찬 캠페인 매칭 서비스',
    url: 'https://ninfle.kr/orangeconnect',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '오렌지커넥트 — N인플',
    description: '인플루언서와 브랜드사를 연결하는 체험단·협찬 캠페인 매칭 서비스',
  },
};

export default function OrangeConnectPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <h1 className="sr-only">오렌지커넥트 — 인플루언서·브랜드 매칭</h1>

      {/* 미니 헤더 */}
      <header className="absolute top-0 left-0 right-0 z-10 px-6 md:px-10 py-5">
        <span className="text-xs font-semibold tracking-[0.18em] text-desc">ORANGE CONNECT</span>
      </header>

      {/* 풀스크린 좌우 분할 */}
      <div className="flex-1 flex flex-col md:flex-row min-h-screen">

        {/* 좌측: 인플루언서 */}
        <Link href="/" className="flex-1 group relative overflow-hidden">
          <div className="absolute inset-0 bg-bg group-hover:bg-surface-hover transition-colors duration-500" />
          <div className="relative h-full flex flex-col justify-between p-8 md:p-12 lg:p-16 min-h-[50vh] md:min-h-screen">
            <div className="mt-8">
              <h2 className="font-title text-3xl md:text-4xl text-text mb-4">인플루언서</h2>
              <p className="text-desc text-base leading-relaxed max-w-sm">
                크리에이터에게는<br />
                <span className="text-text">콘텐츠 가치</span>를
              </p>
            </div>
            <div className="flex items-center gap-3 group-hover:gap-5 transition-all duration-300">
              <span className="text-sm text-text-2">자세히 보기</span>
              <div className="flex-1 h-px bg-border" />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

        {/* 우측: 브랜드사 */}
        <Link href="/orangeconnect/search" className="flex-1 group relative overflow-hidden">
          <div className="absolute inset-0 bg-sunken group-hover:bg-border transition-colors duration-500" />
          <div className="relative h-full flex flex-col justify-between p-8 md:p-12 lg:p-16 min-h-[50vh] md:min-h-screen border-t md:border-t-0 md:border-l border-border">
            <div className="mt-8">
              <h2 className="font-title text-3xl md:text-4xl text-text mb-4">브랜드사</h2>
              <p className="text-desc text-base leading-relaxed max-w-sm">
                브랜드사에게는<br />
                <span className="text-text">확실한 광고효과</span>를
              </p>
            </div>
            <div className="flex items-center gap-3 group-hover:gap-5 transition-all duration-300">
              <span className="text-sm text-text-2">자세히 보기</span>
              <div className="flex-1 h-px bg-border-strong" />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

      </div>
    </div>
  );
}
