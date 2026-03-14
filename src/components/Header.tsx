'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

/* ── 메인 네비게이션 ── */
const NAV_ITEMS = [
  { href: '/my/blogger', label: '블로그' },
  { href: '/influencers', label: '인플루언서' },
  { href: '/keywords', label: '키워드' },
  { href: '/community', label: '커뮤니티' },
];

type UserInfo = {
  type: 'influencer' | 'blogger' | null;
  id: string | null;
  name: string | null;
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(setUser)
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser({ type: null, id: null, name: null });
    router.push('/');
    router.refresh();
  };

  const isActive = (href: string) => pathname.startsWith(href);

  const displayChar = user.type === 'blogger'
    ? (user.name || user.id || 'B').charAt(0).toUpperCase()
    : (user.id || 'N').charAt(0).toUpperCase();
  const tooltipText = user.type === 'blogger'
    ? `블로거 @${user.id} · 로그아웃`
    : `@${user.id} · 로그아웃`;
  const badgeColor = user.type === 'blogger' ? 'bg-[#2DB400]/30' : 'bg-white/20';

  return (
    <>
      <header className="sticky top-0 z-50 bg-header shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* ── 로고 ── */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-title font-bold text-base text-white hidden sm:block">N인플</span>
            </Link>

            {/* ── 데스크탑 네비게이션 ── */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map(item => (
                <Link key={item.href} href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    isActive(item.href) ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* ── 우측: 로그인/프로필 ── */}
          <div className="flex items-center gap-3">
            {user.id ? (
              <div className="flex items-center gap-2">
                {user.type === 'blogger' && (
                  <span className="text-[10px] text-white/60 bg-[#2DB400]/30 px-2 py-0.5 rounded-full hidden sm:block">블로거</span>
                )}
                {user.type === 'influencer' && (
                  <span className="text-[10px] text-white/60 bg-white/15 px-2 py-0.5 rounded-full hidden sm:block">인플루언서</span>
                )}
                <button onClick={handleLogout}
                  className={`w-8 h-8 rounded-full ${badgeColor} flex items-center justify-center text-white font-bold text-xs hover:bg-white/30 transition cursor-pointer`}
                  title={tooltipText}>
                  {displayChar}
                </button>
              </div>
            ) : (
              <Link href="/auth/login"
                className="px-3 py-1.5 bg-white text-header text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors">
                로그인
              </Link>
            )}
            <button className="lg:hidden p-1 text-white/70" onClick={() => setMobileOpen(!mobileOpen)}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── 모바일 메뉴 ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border overflow-y-auto">
          <nav className="flex flex-col p-4 gap-0.5">
            {NAV_ITEMS.map(item => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  isActive(item.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                {item.label}
              </Link>
            ))}

            {/* 로그인/로그아웃 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            {user.id ? (
              <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold text-down hover:text-down/80 hover:bg-down/5 transition-colors cursor-pointer">
                로그아웃
              </button>
            ) : (
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold text-accent hover:bg-accent/5 transition-colors">
                로그인 / 회원가입
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
