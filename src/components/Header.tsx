'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

/* ── N인플 서브메뉴 ── */
const NINFL_SUB = [
  { href: '/notice', label: '공지사항' },
  { href: '/tools', label: '추천 도구' },
  { href: '/subscribe', label: '이용권' },
];

/* ── 인플루언서 그룹 (드롭다운으로 묶음) ── */
const INFLUENCER_GROUP = [
  { href: '/influencers', label: '리스트' },
  { href: '/keywords', label: '키워드' },
  { href: '/rankings', label: '랭킹' },
];

/* ── 공통 메뉴 (모든 유저 공통) ── */
const NAV_COMMON = [
  { href: '/search-volume', label: '검색량' },
  { href: '/community', label: '커뮤니티' },
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
  const [inflOpen, setInflOpen] = useState(false);
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });
  const ninflRef = useRef<HTMLDivElement>(null);
  const inflRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getUserFromCookies());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ninflRef.current && !ninflRef.current.contains(e.target as Node)) {
        setNinflOpen(false);
      }
      if (inflRef.current && !inflRef.current.contains(e.target as Node)) {
        setInflOpen(false);
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

  // 인플루언서 그룹 보여줄지 (블로거 아닌 유저만)
  const showInfluencerGroup = user.type !== 'blogger';
  // 대시보드 링크
  const dashboardLink = user.type === 'blogger'
    ? { href: '/my/blogger', label: '대시보드' }
    : user.type === 'influencer'
      ? { href: '/my', label: '대시보드' }
      : null;

  // N인플 서브메뉴 활성 상태
  const ninflActive = pathname === '/subscribe' || pathname === '/notice' || pathname === '/tools';
  // 인플루언서 그룹 활성 상태
  const inflGroupActive = INFLUENCER_GROUP.some(n => pathname.startsWith(n.href));

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
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-title font-bold text-base text-white hidden sm:block">N인플</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">

              {/* ── N인플 드롭다운 ── */}
              <div className="relative" ref={ninflRef}>
                <button
                  onClick={() => { setNinflOpen(!ninflOpen); setInflOpen(false); }}
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

              {/* ── 구분선 ── */}
              <div className="w-px h-5 bg-white/20 mx-1" />

              {/* ── 대시보드 (로그인 유저만) ── */}
              {dashboardLink && (
                <Link href={dashboardLink.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    pathname.startsWith(dashboardLink.href) ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  {dashboardLink.label}
                </Link>
              )}

              {/* ── 인플루언서 그룹 드롭다운 (블로거 제외) ── */}
              {showInfluencerGroup && (
                <div className="relative" ref={inflRef}>
                  <button
                    onClick={() => { setInflOpen(!inflOpen); setNinflOpen(false); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                      inflGroupActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}>
                    인플루언서
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`transition-transform ${inflOpen ? 'rotate-180' : ''}`}>
                      <path d="M3 5l3 3 3-3" />
                    </svg>
                  </button>
                  {inflOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-surface rounded-lg shadow-lg border border-border py-1 min-w-[160px] z-50">
                      {INFLUENCER_GROUP.map(s => (
                        <Link key={s.href} href={s.href}
                          onClick={() => setInflOpen(false)}
                          className={`block px-4 py-2 text-sm transition-colors ${
                            pathname.startsWith(s.href) ? 'text-accent font-semibold bg-accent/5' : 'text-text hover:bg-surface-hover hover:text-accent'
                          }`}>
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── 구분선 ── */}
              {showInfluencerGroup && <div className="w-px h-5 bg-white/20 mx-1" />}

              {/* ── 공통 메뉴 (검색량, 커뮤니티) ── */}
              {NAV_COMMON.map(n => {
                const active = pathname.startsWith(n.href);
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

      {/* ── 모바일 메뉴 ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border overflow-y-auto">
          <nav className="flex flex-col p-4 gap-0.5">
            {/* N인플 서브메뉴 */}
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">N인플</div>
            {NINFL_SUB.map(s => (
              <Link key={s.href} href={s.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  pathname === s.href ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                {s.label}
              </Link>
            ))}

            {/* 대시보드 (로그인 유저) */}
            {dashboardLink && (
              <>
                <div className="border-t-2 border-border my-3 mx-2" />
                <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">
                  {user.type === 'blogger' ? '블로거' : '내 대시보드'}
                </div>
                <Link href={dashboardLink.href} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    pathname.startsWith(dashboardLink.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                  }`}>
                  {dashboardLink.label}
                </Link>
              </>
            )}

            {/* 인플루언서 그룹 (블로거 제외) */}
            {showInfluencerGroup && (
              <>
                <div className="border-t-2 border-border my-3 mx-2" />
                <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">인플루언서</div>
                {INFLUENCER_GROUP.map(n => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                        active ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                      }`}>
                      {n.label}
                    </Link>
                  );
                })}
              </>
            )}

            {/* 공통 메뉴 */}
            <div className="border-t-2 border-border my-3 mx-2" />
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">공통</div>
            {NAV_COMMON.map(n => {
              const active = pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    active ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                  }`}>
                  {n.label}
                </Link>
              );
            })}

            {/* 로그인/로그아웃 */}
            <div className="border-t-2 border-border my-3 mx-2" />
            {user.id ? (
              <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold text-down hover:text-down/80 hover:bg-down/5 transition-colors cursor-pointer">
                로그아웃
              </button>
            ) : (
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold text-accent hover:bg-accent/5 transition-colors">
                로그인
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
