'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuth } from '@/hooks/useAuth';
import NotificationBell from './NotificationBell';
import MessageBell from './MessageBell';

/* ── 메인 네비게이션 항목 (드롭다운 지원) ── */
interface NavItem {
  href?: string;
  label: string;
  children?: { href: string; label: string }[];
  authOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'N인플',
    children: [
      { href: '/notice', label: '공지사항' },
    ],
  },
  {
    label: '대시보드',
    authOnly: true,
    children: [
      { href: '/my/blogger', label: '블로그 분석' },
      { href: '/my/campaigns', label: '캠페인 현황' },
      { href: '/my/post-analysis', label: '포스팅 분석' },
      { href: '/my', label: '키워드챌린지' },
      { href: '/my/settlements', label: '원고료 정산내역' },
    ],
  },
  { href: '/competitor', label: '경쟁자 분석', authOnly: true },
  {
    label: '인플루언서',
    children: [
      { href: '/influencers', label: '리스트' },
      { href: '/stats', label: '연도별 선정 현황' },
    ],
  },
  {
    label: '키워드',
    children: [
      { href: '/keywords/blogger', label: '키워드검색' },
      { href: '/keywords', label: '키워드챌린지' },
    ],
  },
  { href: '/community', label: '커뮤니티' },
  { href: '/subscribe', label: '이용권' },
];


function NavDropdown({ label, items, isActive }: { label: string; items: { href: string; label: string }[]; isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleEnter = () => { if (timerRef.current) clearTimeout(timerRef.current); setOpen(true); };
  const handleLeave = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  const anyActive = items.some(item => isActive(item.href));

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
          anyActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-surface rounded-xl border border-border shadow-lg py-1.5 z-50">
          {items.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive(item.href) ? 'text-accent bg-accent/5' : 'text-text hover:bg-bg'
              }`}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type UserInfo = {
  type: 'influencer' | 'blogger' | 'unified' | null;
  id: string | null;
  blogId?: string | null;
  name: string | null;
};

interface HeaderProps {
  serverUser?: { type: string; id: string; name: string; imageUrl?: string } | null;
}

export default function Header({ serverUser }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { user: clientUser, isLoading: authLoading, logout: authLogout } = useAuth();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // 서버에서 전달받은 유저 정보를 우선 사용, 클라이언트에서 로드되면 클라이언트 데이터로 전환
  const user = (clientUser.id ? clientUser : serverUser ? { ...clientUser, type: serverUser.type as UserInfo['type'], id: serverUser.id, name: serverUser.name } : clientUser);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    authLogout();
    router.push('/');
    router.refresh();
  };

  const isActive = (href: string) => pathname.startsWith(href);

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
              {NAV_ITEMS.filter(item => !item.authOnly || user.id).map(item =>
                item.children ? (
                  <NavDropdown key={item.label} label={item.label} items={item.children} isActive={isActive} />
                ) : (
                  <Link key={item.href} href={item.href!}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      isActive(item.href!) ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}>
                    {item.label}
                  </Link>
                )
              )}
            </nav>
          </div>

          {/* ── 우측: 로그인/프로필 ── */}
          <div className="flex items-center gap-3">
            {authLoading ? (
              <div className="w-20 h-8" />
            ) : user.id ? (
              <div className="flex items-center gap-2">
                <MessageBell />
                <NotificationBell />
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                    title="프로필 메뉴">
                    {serverUser?.imageUrl ? (
                      <img src={serverUser.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className={`w-7 h-7 rounded-full ${badgeColor} flex items-center justify-center text-white font-bold text-[10px]`}>
                        {displayChar}
                      </div>
                    )}
                    <span className="text-xs text-white font-semibold hidden sm:block">@{user.name || user.id}</span>
                  </button>
                  {profileOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-surface rounded-xl border border-border shadow-lg py-2 z-50">
                      <div className="px-4 py-2.5 border-b border-border">
                        <p className="text-sm font-bold text-text">{user.name || user.id}</p>
                        {user.email && <p className="text-xs text-dim mt-0.5">{user.email}</p>}
                      </div>
                      <Link href="/profile" onClick={() => setProfileOpen(false)}
                        className="flex items-center px-4 py-2.5 text-sm text-text hover:bg-bg transition">
                        마이페이지
                      </Link>
                      <button onClick={() => { setProfileOpen(false); handleLogout(); }}
                        className="w-full flex items-center px-4 py-2.5 text-sm text-down hover:bg-bg transition cursor-pointer">
                        로그아웃
                      </button>
                    </div>
                  )}
                </div>
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
            {NAV_ITEMS.filter(item => !item.authOnly || user.id).map(item =>
              item.children ? (
                <div key={item.label}>
                  <p className="px-5 py-2 text-xs font-bold text-dim uppercase">{item.label}</p>
                  {item.children.map(child => (
                    <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-8 py-3 rounded-xl text-sm font-semibold transition-colors ${
                        isActive(child.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                      }`}>
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link key={item.href} href={item.href!} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    isActive(item.href!) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                  }`}>
                  {item.label}
                </Link>
              )
            )}

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
