'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/contexts/SidebarContext';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { canAccess, planHighlight } from '@/lib/plan-access';
import { isDesktop } from '@/lib/desktop';
import {
  SIDEBAR_GROUPS,
  SIDEBAR_HOME,
  SIDEBAR_FOOTER_LINKS,
  SIDEBAR_HIDDEN_PREFIXES,
  type SidebarItem,
} from '@/lib/sidebar-nav';
import type { PlanTier } from '@/lib/dashboard-catalog';
import { useEffect, useState } from 'react';

const DESKTOP_HIDDEN_HREFS = new Set<string>(['/community', '/subscribe']);

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="shrink-0">
      <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function NavLink({
  item,
  active,
  currentPlan,
  isGuest,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  currentPlan: PlanTier;
  isGuest: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { openGate } = useMemberOnlyGate();

  if (item.disabled) {
    return (
      <span className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-dim/50 cursor-not-allowed">
        {item.label}
        <span className="ml-auto text-[10px] font-bold text-dim/60 bg-bg px-1.5 py-0.5 rounded">준비중</span>
      </span>
    );
  }

  // 비회원(로그인·데모 모두 아님): 회원 전용 메뉴는 라우팅 대신 회원 전용 모달로 유도
  if (item.authOnly && isGuest) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          openGate(item.href);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-dim hover:bg-bg transition-colors text-left cursor-pointer"
      >
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-dim/60"><LockIcon /></span>
      </button>
    );
  }

  const locked = !canAccess(item.requiredPlan, currentPlan);

  if (locked) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          router.push(`/subscribe?highlight=${planHighlight(item.requiredPlan!)}`);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-dim hover:bg-bg transition-colors text-left cursor-pointer"
      >
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-accent"><LockIcon /></span>
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-bg'
      }`}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarContent({
  pathname,
  currentPlan,
  isGuest,
  isInDesktopApp,
  onNavigate,
}: {
  pathname: string;
  currentPlan: PlanTier;
  isGuest: boolean;
  isInDesktopApp: boolean;
  onNavigate: () => void;
}) {
  const visibleFooterLinks = SIDEBAR_FOOTER_LINKS.filter(
    (link) => !(isInDesktopApp && DESKTOP_HIDDEN_HREFS.has(link.href)),
  );

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <NavLink
          item={SIDEBAR_HOME}
          active={pathname === '/'}
          currentPlan={currentPlan}
          isGuest={isGuest}
          onNavigate={onNavigate}
        />
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[11px] font-bold text-dim/70 uppercase tracking-wide">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.label}
                  item={item}
                  active={item.href !== '#' && pathname.startsWith(item.href)}
                  currentPlan={currentPlan}
                  isGuest={isGuest}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3 space-y-0.5 shrink-0">
        {visibleFooterLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`block px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              pathname.startsWith(link.href) ? 'text-accent' : 'text-dim hover:text-text'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar();
  const [isInDesktopApp, setIsInDesktopApp] = useState(false);

  useEffect(() => {
    setIsInDesktopApp(isDesktop());
  }, []);

  // 모바일 오버레이가 열려 있으면 라우트 이동 시 자동으로 닫는다
  useEffect(() => {
    closeMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const hidden = SIDEBAR_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isLoading || hidden) return null;

  // 정식 로그인도, 데모 체험 중도 아닌 순수 비회원 — 메뉴는 보이되 회원 전용 항목은 클릭 시 모달로 유도
  const isGuest = !user.id && !user.isDemo;

  const currentPlan: PlanTier = (() => {
    if (!user.subscriptionActive) return 'free';
    if (user.subscriptionPlan === 'INFLUENCER') return 'influencer';
    if (user.subscriptionPlan === 'BLOGGER') return 'blogger';
    return 'free';
  })();

  return (
    <>
      {/* ── 데스크탑 사이드바 ── */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-16 h-[calc(100vh-4rem)] bg-surface border-r border-border transition-[width] duration-200 ${
          collapsed ? 'w-14' : 'w-60'
        }`}
      >
        {collapsed ? (
          <nav className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1">
            <Link
              href="/"
              title={SIDEBAR_HOME.label}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                pathname === '/' ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-bg'
              }`}
            >
              {SIDEBAR_HOME.label}
            </Link>
            {SIDEBAR_GROUPS.map((group) => (
              <button
                key={group.label}
                type="button"
                title={group.label}
                onClick={toggleCollapsed}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[11px] font-bold text-dim hover:text-text hover:bg-bg transition-colors cursor-pointer"
              >
                {group.icon}
              </button>
            ))}
          </nav>
        ) : (
          <SidebarContent
            pathname={pathname}
            currentPlan={currentPlan}
            isGuest={isGuest}
            isInDesktopApp={isInDesktopApp}
            onNavigate={() => {}}
          />
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? '펼치기' : '접기'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className="shrink-0 flex items-center justify-center gap-1.5 py-2.5 border-t border-border text-dim hover:text-accent transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {!collapsed && <span className="text-xs font-semibold">접기</span>}
        </button>
      </aside>

      {/* ── 모바일 오버레이 ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-16 z-40 flex flex-col bg-surface border-t border-border">
          <SidebarContent
            pathname={pathname}
            currentPlan={currentPlan}
            isGuest={isGuest}
            isInDesktopApp={isInDesktopApp}
            onNavigate={closeMobile}
          />
        </div>
      )}
    </>
  );
}
