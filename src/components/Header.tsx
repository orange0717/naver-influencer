'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuth } from '@/hooks/useAuth';

/* ── 메인 네비게이션 ── */
const NAV_ITEMS = [
  { href: '/influencers', label: '인플루언서 리스트' },
  { href: '/keywords', label: '키워드 리스트' },
  { href: '/community', label: '커뮤니티' },
  { href: '/subscribe', label: '이용권' },
];

/* ── N인플 소개 메뉴 ── */
const INFO_GROUP = [
  { href: '/guide', label: '서비스 가이드' },
  { href: '/notice', label: '공지사항' },
];

type UserInfo = {
  type: 'influencer' | 'blogger' | 'unified' | null;
  id: string | null;
  blogId?: string | null;
  name: string | null;
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { user, logout: authLogout } = useAuth();
  const infoRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    authLogout();
    router.push('/');
    router.refresh();
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setInfoOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (href: string) => pathname.startsWith(href);
  const infoActive = INFO_GROUP.some(n => pathname === n.href);

  const displayChar = user.type === 'blogger'
    ? (user.name || user.id || 'B').charAt(0).toUpperCase()
    : (user.id || 'N').charAt(0).toUpperCase();
  const tooltipText = user.type === 'unified'
    ? `@${user.id} · 블로그 @${user.blogId} · 로그아웃`
    : user.type === 'blogger'
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
            <nav aria-label="메인 네비게이션" className="hidden lg:flex items-center gap-1">
              {/* N인플 드롭다운 */}
              <div className="relative" ref={infoRef}>
                <button
                  onClick={() => setInfoOpen(prev => !prev)}
                  aria-expanded={infoOpen}
                  aria-controls="info-dropdown"
                  aria-label="N인플 메뉴"
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                    infoActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  N인플
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
                    aria-hidden="true"
                    className={`transition-transform ${infoOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 5l3 3 3-3" />
                  </svg>
                </button>
                {infoOpen && (
                  <div id="info-dropdown" role="menu" className="absolute top-full left-0 mt-1 bg-surface rounded-xl shadow-lg border border-border py-1.5 z-50 min-w-[140px]">
                    {INFO_GROUP.map(s => (
                      <Link key={s.href} href={s.href}
                        onClick={() => setInfoOpen(false)}
                        className={`block px-4 py-2.5 transition-colors text-sm ${
                          pathname === s.href ? 'text-accent font-semibold bg-accent/5' : 'text-text hover:bg-surface-hover hover:text-accent'
                        }`}>
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-5 bg-white/20 mx-1" />

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
                <Link href="/my" className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/10 transition">
                  <span className="text-xs text-white/80 font-semibold">@{user.name || user.id}</span>
                </Link>
                <button onClick={handleLogout}
                  className={`w-8 h-8 rounded-full ${badgeColor} flex items-center justify-center text-white font-bold text-xs hover:bg-white/30 transition cursor-pointer`}
                  title={tooltipText}
                  aria-label={`${user.id} 로그아웃`}>
                  {displayChar}
                </button>
              </div>
            ) : (
              <Link href="/auth/login"
                className="px-3 py-1.5 bg-white text-header text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors">
                로그인
              </Link>
            )}
            <button
              className="lg:hidden p-1 text-white/70"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label="메뉴 열기">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── 모바일 메뉴 ── */}
      {mobileOpen && (
        <div id="mobile-menu" className="lg:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border overflow-y-auto">
          <nav aria-label="모바일 네비게이션" className="flex flex-col p-4 gap-0.5">
            {NAV_ITEMS.map(item => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  isActive(item.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                {item.label}
              </Link>
            ))}

            {/* N인플 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-dim tracking-widest uppercase">N인플</div>
            {INFO_GROUP.map(s => (
              <Link key={s.href} href={s.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  pathname === s.href ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                {s.label}
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
