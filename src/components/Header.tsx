'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

const NINFL_SUB = [
  { href: '/notice', label: '공지사항' },
  { href: '/subscribe', label: '구독' },
];

const NAV_INFLUENCER = [
  { href: '/my', label: '대시보드' },
  { href: '/influencers', label: '인플루언서 리스트' },
  { href: '/keywords', label: '키워드' },
  { href: '/rankings', label: '랭킹' },
];

const NAV_BLOGGER = [
  { href: '/my/blogger', label: '대시보드' },
  { href: '/keywords', label: '키워드' },
  { href: '/rankings', label: '랭킹' },
];

const NAV_GUEST = [
  { href: '/influencers', label: '인플루언서 리스트' },
  { href: '/keywords', label: '키워드' },
  { href: '/rankings', label: '랭킹' },
];

type UserInfo = {
  type: 'influencer' | 'blogger' | null;
  id: string | null;
  name: string | null;
};

function getUserFromCookies(): UserInfo {
  const cookies = document.cookie;
  const naverMatch = cookies.match(/(?:^|;\s*)naver_id=([^;]*)/);
  const blogMatch = cookies.match(/(?:^|;\s*)blog_id=([^;]*)/);
  const blogNameMatch = cookies.match(/(?:^|;\s*)blog_name=([^;]*)/);

  if (naverMatch) {
    return { type: 'influencer', id: decodeURIComponent(naverMatch[1]), name: null };
  }
  if (blogMatch) {
    const name = blogNameMatch ? decodeURIComponent(blogNameMatch[1]) : null;
    return { type: 'blogger', id: decodeURIComponent(blogMatch[1]), name };
  }
  return { type: null, id: null, name: null };
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ninflOpen, setNinflOpen] = useState(false);
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getUserFromCookies());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNinflOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    document.cookie = 'naver_id=; path=/; max-age=0';
    document.cookie = 'blog_id=; path=/; max-age=0';
    document.cookie = 'blog_name=; path=/; max-age=0';
    document.cookie = 'user_type=; path=/; max-age=0';
    setUser({ type: null, id: null, name: null });
    router.push('/');
    router.refresh();
  };

  const NAV = user.type === 'blogger' ? NAV_BLOGGER : user.type === 'influencer' ? NAV_INFLUENCER : NAV_GUEST;
  const ninflActive = pathname === '/subscribe' || pathname === '/notice';
  const displayChar = user.type === 'blogger'
    ? (user.name || user.id || 'B').charAt(0).toUpperCase()
    : (user.id || 'N').charAt(0).toUpperCase();
  const tooltipText = user.type === 'blogger'
    ? `블로거 @${user.id} · 로그아웃`
    : `@${user.id} · 로그아웃`;

  // 유저 타입 배지 색상
  const badgeColor = user.type === 'blogger' ? 'bg-[#2DB400]/30' : 'bg-white/20';

  return (
    <>
      <header className="sticky top-0 z-50 bg-header shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-title font-bold text-base text-white hidden sm:block">N인플</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {/* N인플 드롭다운 */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setNinflOpen(!ninflOpen)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                    ninflActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  N인플
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform ${ninflOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 5l3 3 3-3" />
                  </svg>
                </button>
                {ninflOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-surface rounded-lg shadow-lg border border-border py-1 min-w-[120px] z-50">
                    {NINFL_SUB.map(s => (
                      <Link key={s.href} href={s.href}
                        onClick={() => setNinflOpen(false)}
                        className={`block px-4 py-2 text-sm transition-colors ${
                          pathname === s.href ? 'text-accent font-semibold bg-accent/5' : 'text-text hover:bg-surface-hover hover:text-accent'
                        }`}>
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* 일반 네비 */}
              {NAV.map(n => {
                const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}>
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
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
            <button className="md:hidden p-1 text-white/70" onClick={() => setMobileOpen(!mobileOpen)}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border">
          <nav className="flex flex-col p-4 gap-1">
            {/* 모바일: N인플 서브메뉴 */}
            <div className="px-4 py-2 text-xs font-bold text-dim">N인플</div>
            {NINFL_SUB.map(s => (
              <Link key={s.href} href={s.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-6 py-2.5 rounded-lg text-sm font-semibold ${
                  pathname === s.href ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text'
                }`}>
                {s.label}
              </Link>
            ))}
            <div className="border-t border-border my-2" />
            {/* 유저 타입 표시 */}
            {user.type && (
              <div className="px-4 py-2 text-xs font-bold text-dim">
                {user.type === 'blogger' ? '블로거 메뉴' : '인플루언서 메뉴'}
              </div>
            )}
            {/* 모바일: 일반 네비 */}
            {NAV.map(n => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold ${
                    active ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text'
                  }`}>
                  {n.label}
                </Link>
              );
            })}
            {user.id ? (
              <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-down hover:text-down/80 cursor-pointer">
                로그아웃
              </button>
            ) : (
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-accent">
                로그인
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
