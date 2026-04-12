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
      <header className="sticky top-0 z-50 bg-accent shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/orangeconnect" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">AD</div>
              <span className="font-bold text-base text-white hidden sm:block">N인플 광고주</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {AD_NAV.filter(item => !item.authOnly || isLoggedIn).map(item => (
                <Link key={item.href} href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    isActive(item.href, item.exact) ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/"
              className="px-3 py-1.5 text-white/70 text-sm font-semibold hover:text-white transition-colors hidden sm:block">
              N인플 →
            </Link>
            {isLoading ? (
              <div className="w-16 h-8" />
            ) : isLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/80 font-semibold hidden md:block">{advertiser.companyName}</span>
                <button onClick={logout}
                  className="px-3 py-1.5 text-white/70 text-sm font-semibold hover:text-white transition-colors cursor-pointer">
                  로그아웃
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/orangeconnect/login"
                  className="px-3 py-1.5 text-white/70 text-sm font-semibold hover:text-white transition-colors">
                  로그인
                </Link>
                <Link href="/orangeconnect/signup"
                  className="px-3 py-1.5 bg-white text-accent text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors">
                  회원가입
                </Link>
              </div>
            )}
            <button
              className="md:hidden p-1 text-white/70"
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

  // 메인 게이트웨이 페이지는 완전 독립 (N인플 헤더/푸터 가림)
  if (isMainPage) {
    return (
      <div className="fixed inset-0 z-[100] bg-bg overflow-auto -mx-4 -mt-6">
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen -mx-4 -mt-6 -mb-10">
      <AdHeader />
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-10 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}

export default function AdLayout({ children }: { children: React.ReactNode }) {
  return <AdLayoutInner>{children}</AdLayoutInner>;
}
