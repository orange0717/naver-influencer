'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/ad/search', label: '인플루언서 찾기' },
  { href: '/ad/campaign', label: '캠페인' },
  { href: '/ad', label: '소개', exact: true },
];

const FOOTER_LINKS = [
  { href: '/ad/search', label: '인플루언서 찾기' },
  { href: '/ad/campaign', label: '캠페인' },
  { href: '/ad', label: '소개' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
];

export default function AdLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {/* ── 오렌지커넥트 헤더 ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* 브랜드 */}
          <Link href="/ad" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
              O
            </div>
            <span className="font-title font-extrabold text-sm text-blue-900 group-hover:text-blue-600 transition-colors">
              오렌지커넥트
            </span>
          </Link>

          {/* 네비게이션 */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(link => {
              const active = link.exact
                ? pathname === link.href
                : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/"
              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              N인플
            </Link>
          </nav>
        </div>
      </header>

      {/* ── 콘텐츠 ── */}
      {children}

      {/* ── 오렌지커넥트 푸터 ── */}
      <footer className="bg-gray-900 text-gray-400 mt-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold text-xs">O</div>
              <span className="font-title font-extrabold text-white text-sm">오렌지커넥트</span>
              <span className="text-[10px] text-gray-500 ml-1">by N인플</span>
            </div>
            <nav className="flex flex-wrap gap-4">
              {FOOTER_LINKS.map(link => (
                <Link key={link.href} href={link.href} className="text-xs text-gray-500 hover:text-white transition-colors">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="border-t border-white/10 pt-4 text-[11px] text-gray-600 leading-relaxed">
            <p>오렌지도서관 · 대표 한미선 · 사업자등록번호 702-62-00986 · 통신판매 2025-충남천안-1491 · 전화 0507-1394-5091 · 이메일 orange@orangelibrary.co.kr</p>
            <p>충남 천안시 서북구 검은들 3길 46 803-2(886호) · 개인정보보호책임자 한미선</p>
            <p className="mt-2 text-gray-700">&copy; 2026 오렌지도서관 · Built with Claude by Anthropic</p>
          </div>
        </div>
      </footer>
    </>
  );
}
