'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuth } from '@/hooks/useAuth';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { isDesktop } from '@/lib/desktop';
import { SIDEBAR_FOOTER_LINKS } from '@/lib/sidebar-nav';
import NotificationBell from './NotificationBell';
import MessageBell from './MessageBell';
import HeaderSearch from './HeaderSearch';
import UsageQuotaBadge from './UsageQuotaBadge';
import CreditBadge from './CreditBadge';

// 비로그인 게스트에게는 로그인이 필요한 링크(공지사항)를 숨김
const GUEST_NAV_LINKS = SIDEBAR_FOOTER_LINKS.filter((link) => !link.authOnly);

type UserInfo = {
  type: 'influencer' | 'blogger' | 'unified' | null;
  id: string | null;
  blogId?: string | null;
  name: string | null;
  email?: string | null;
  authId?: string | null;
  isAdmin?: boolean;
  restricted?: boolean;
  subscriptionPlan?: string | null;
  subscriptionActive?: boolean;
};

interface HeaderProps {
  serverUser?: { type: string; id: string; name: string; imageUrl?: string } | null;
}

export default function Header({ serverUser }: HeaderProps) {
  const router = useRouter();
  const { mobileOpen, openMobile, closeMobile } = useSidebar();
  const [profileOpen, setProfileOpen] = useState(false);
  const [inDesktopApp, setInDesktopApp] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { user: clientUser, isLoading: authLoading, logout: authLogout } = useAuth();
  const { openLogin } = useAuthModal();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Electron 데스크탑 앱 안이면 헤더의 "앱 다운로드" 버튼은 노출하지 않음
  useEffect(() => {
    setInDesktopApp(isDesktop());
  }, []);

  // 서버에서 전달받은 유저 정보를 우선 사용, 클라이언트에서 로드되면 클라이언트 데이터로 전환
  const user = (clientUser.id ? clientUser : serverUser ? { ...clientUser, type: serverUser.type as UserInfo['type'], id: serverUser.id, name: serverUser.name } : clientUser) as UserInfo;

  /** 헤더에 /download 안내 표시 (Electron 내 제외). 링크 이동은 로그인 회원만 */
  const canShowAppDownload = !inDesktopApp;
  const downloadNavUnlocked = !authLoading && !!user.id;

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    authLogout();
    router.push('/');
    router.refresh();
  };

  // 공지사항/커뮤니티/성장후기/이용권/서비스소개 — 로그인 사용자는 전체, 게스트는 로그인 필요 링크 제외
  const headerNavLinks = user.id ? SIDEBAR_FOOTER_LINKS : GUEST_NAV_LINKS;

  const displayChar = user.type === 'blogger'
    ? (user.name || user.id || 'B').charAt(0).toUpperCase()
    : (user.id || 'N').charAt(0).toUpperCase();
  const badgeColor = user.type === 'blogger' ? 'bg-[#2DB400]' : 'bg-accent';

  return (
    <>
      <header className="sticky top-0 z-50 w-full max-w-[100vw] bg-surface border-b border-[#F0F0F0]">
        <div className="flex h-16 w-full min-w-0 max-w-full items-center flex-nowrap gap-1.5 px-2.5 sm:gap-2 sm:px-3 lg:gap-3 lg:px-5">
          {/* ── 로고 (왼쪽 끝) ── */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white font-medium text-sm">N</div>
            <span className="font-title font-medium text-[16px] text-[#222222] hidden sm:flex items-center gap-1.5">
              N인플
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-normal leading-none bg-accent/10 text-accent">베타</span>
            </span>
          </Link>

          {/* ── 서비스 정체성 태그라인 — "AI 서비스"가 아니라 데이터 분석 툴임을 헤더에서부터 각인 (2026-08-09) ── */}
          <span className="hidden lg:block w-px h-3.5 bg-[#E5E5E5] shrink-0" aria-hidden="true" />
          <span className="hidden lg:inline text-[13px] font-normal text-[#777777] tracking-tight whitespace-nowrap shrink-0">
            네이버 검색 데이터 분석
          </span>

          {/* ── 왼쪽: 공지사항 등 서브 네비 (로고 옆) ── */}
          {!authLoading && (
            <nav aria-label="서브 네비게이션" className="hidden lg:flex items-center gap-1 ml-2">
              {headerNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-lg text-[15px] font-normal text-[#222222] hover:bg-black/[0.04] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {/* ── 우측: 검색 · 앱 다운로드 · 쪽지 · 알림 · 프로필/로그인 ── */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            <HeaderSearch />
            {!authLoading && <UsageQuotaBadge />}
            {!authLoading && <CreditBadge />}
            {canShowAppDownload &&
              (downloadNavUnlocked ? (
                <Link
                  href="/download"
                  title="N인플 데스크탑 앱 다운로드"
                  aria-label="N인플 데스크탑 앱 다운로드"
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-lg text-[13px] font-normal text-[#333333] bg-white border border-[#E5E5E5] hover:bg-black/[0.03] transition-colors shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span className="hidden sm:inline">앱 다운로드</span>
                </Link>
              ) : (
                <span
                  title="로그인 후 이용할 수 있습니다"
                  aria-label="앱 다운로드 (로그인 필요)"
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-lg text-[13px] font-normal text-[#999999] bg-white border border-[#EEEEEE] cursor-not-allowed shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-70">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span className="hidden sm:inline">앱 다운로드</span>
                </span>
              ))}
            <MessageBell />
            <NotificationBell />
            {authLoading ? (
              <div className="w-20 h-8" />
            ) : user.id ? (
              <div className="flex min-w-0 max-w-full items-center gap-1 sm:gap-2">
                <div className="relative min-w-0" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-black/[0.04] sm:gap-2 sm:px-2 cursor-pointer"
                    title="프로필 메뉴">
                    {serverUser?.imageUrl ? (
                      <img src={serverUser.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${badgeColor} text-[10px] font-medium text-white`}>
                        {displayChar}
                      </div>
                    )}
                    <span className="hidden max-w-[5.5rem] truncate text-[15px] font-normal text-[#333333] sm:block md:max-w-[9rem] lg:max-w-[11rem]">
                      @{user.name || user.id}
                    </span>
                  </button>
                  {profileOpen && (
                    <div className="absolute right-0 top-full z-[100] mt-2 w-56 rounded-xl border border-border bg-surface py-2 shadow-lg">
                      <div className="px-4 py-2.5 border-b border-border">
                        <p className="text-sm font-bold text-text">{user.name || user.id}</p>
                        {user.email && <p className="text-xs text-dim mt-0.5">{user.email}</p>}
                      </div>
                      <Link href="/profile" onClick={() => setProfileOpen(false)}
                        className="flex items-center px-4 py-2.5 text-sm text-text hover:bg-bg transition">
                        마이페이지
                      </Link>
                      {user.isAdmin && (
                        <Link href="/admin" onClick={() => setProfileOpen(false)}
                          className="flex items-center px-4 py-2.5 text-sm text-text hover:bg-bg transition">
                          관리자
                        </Link>
                      )}
                      <button onClick={() => { setProfileOpen(false); handleLogout(); }}
                        className="w-full flex items-center px-4 py-2.5 text-sm text-down hover:bg-bg transition cursor-pointer">
                        로그아웃
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openLogin()}
                className="cursor-pointer px-4 py-2 bg-accent text-white text-[15px] font-normal rounded-lg hover:bg-accent-hover transition-colors">
                로그인
              </button>
            )}
            <button
              className="lg:hidden p-1 text-[#333333]"
              onClick={() => (mobileOpen ? closeMobile() : openMobile())}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label="메뉴 열기">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
