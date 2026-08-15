'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAdAuth } from '@/hooks/useAdAuth';

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  authOnly?: boolean;
}

const AD_NAV: NavItem[] = [
  { href: '/orangeconnect', label: '광고주 홈', exact: true },
  { href: '/orangeconnect/search', label: 'AI 검색' },
  { href: '/orangeconnect/campaign', label: '캠페인' },
  { href: '/orangeconnect/dashboard', label: '대시보드', authOnly: true },
];

function AdHeader() {
  const pathname = usePathname();
  const { advertiser, isLoading, logout } = useAdAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const isLoggedIn = !!advertiser.id;

  return (
    <>
      <header className="sticky top-0 z-50 bg-header border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/orangeconnect" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-sunken border border-border flex items-center justify-center text-text-2 font-semibold text-xs">AD</div>
              <span className="font-title text-base text-text hidden sm:block">N인플 광고주</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {AD_NAV.filter(item => !item.authOnly || isLoggedIn).map(item => (
                <Link key={item.href} href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive(item.href, item.exact) ? 'bg-sunken text-text font-semibold' : 'text-text-2 hover:text-text hover:bg-surface-hover'
                  }`}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/"
              className="px-3 py-1.5 text-text-2 text-sm hover:text-text transition-colors hidden sm:block">
              N인플 →
            </Link>
            {isLoading ? (
              <div className="w-16 h-8" />
            ) : isLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-desc hidden md:block">{advertiser.companyName}</span>
                <button onClick={logout}
                  className="px-3 py-1.5 text-text-2 text-sm hover:text-text transition-colors cursor-pointer">
                  로그아웃
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/orangeconnect/login"
                  className="px-3 py-1.5 text-text-2 text-sm hover:text-text transition-colors">
                  로그인
                </Link>
                <Link href="/orangeconnect/signup"
                  className="px-3 py-1.5 bg-accent text-white text-sm font-semibold rounded-md hover:bg-accent-hover transition-colors">
                  회원가입
                </Link>
              </div>
            )}
            <button
              className="md:hidden p-1 text-text-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-label="메뉴 열기">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* 모바일 메뉴 */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border overflow-y-auto">
          <nav className="flex flex-col p-4 gap-0.5">
            {AD_NAV.filter(item => !item.authOnly || isLoggedIn).map(item => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  isActive(item.href, item.exact) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                {item.label}
              </Link>
            ))}
            <div className="border-t border-border/50 my-3 mx-2" />
            <Link href="/" onClick={() => setMobileOpen(false)}
              className="px-5 py-3 rounded-xl text-sm font-semibold text-dim hover:text-text hover:bg-surface transition-colors">
              N인플 사이트
            </Link>
            {isLoggedIn ? (
              <button onClick={() => { logout(); setMobileOpen(false); }}
                className="px-5 py-3 rounded-xl text-sm font-semibold text-down hover:bg-down/5 transition-colors text-left cursor-pointer">
                로그아웃
              </button>
            ) : (
              <>
                <Link href="/orangeconnect/login" onClick={() => setMobileOpen(false)}
                  className="px-5 py-3 rounded-xl text-sm font-semibold text-accent hover:bg-accent/5 transition-colors">
                  로그인
                </Link>
                <Link href="/orangeconnect/signup" onClick={() => setMobileOpen(false)}
                  className="px-5 py-3 rounded-xl text-sm font-semibold text-accent hover:bg-accent/5 transition-colors">
                  회원가입
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

function AdLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMainPage = pathname === '/orangeconnect';

  // 오렌지커넥트 전체가 N인플과 완전 분리
  if (isMainPage) {
    return (
      <div className="fixed inset-0 z-[100] bg-bg overflow-auto -mx-4 -mt-6">
        {children}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-bg overflow-auto -mx-4 -mt-6">
      <div className="flex flex-col min-h-screen">
        <AdHeader />
        <main className="max-w-7xl mx-auto px-4 pt-6 pb-10 flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AdLayout({ children }: { children: React.ReactNode }) {
  return <AdLayoutInner>{children}</AdLayoutInner>;
}
