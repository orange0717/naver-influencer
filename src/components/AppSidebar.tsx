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
  getActiveHref,
  type SidebarItem,
} from '@/lib/sidebar-nav';
import type { PlanTier } from '@/lib/dashboard-catalog';
import { useEffect, useState } from 'react';

const DESKTOP_HIDDEN_HREFS = new Set<string>(['/community', '/subscribe']);

/** 사이드바 전체 메뉴 href 목록 — 현재 경로와 가장 구체적으로 일치하는 단 하나의 메뉴만 active로 고르기 위함 */
const ALL_NAV_HREFS = [SIDEBAR_HOME.href, ...SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.href))];

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
      <span className="flex items-center gap-2 pl-[10px] pr-3 py-2 rounded-lg text-sm text-dim/50 border-l-2 border-transparent cursor-not-allowed">
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
        className="w-full flex items-center gap-2 pl-[10px] pr-3 py-2 rounded-lg text-sm font-semibold text-dim border-l-2 border-transparent hover:bg-bg hover:text-text transition-colors text-left cursor-pointer"
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
        className="w-full flex items-center gap-2 pl-[10px] pr-3 py-2 rounded-lg text-sm font-semibold text-dim border-l-2 border-transparent hover:bg-bg hover:text-text transition-colors text-left cursor-pointer"
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
      className={`flex items-center gap-2 pl-[10px] pr-3 py-2 rounded-lg text-sm font-semibold border-l-2 transition-colors ${
        active
          ? 'bg-accent/15 text-accent border-accent'
          : 'text-dim border-transparent hover:text-text hover:bg-bg'
      }`}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

const SIDEBAR_ACCORDION_KEY = 'ninfl:sidebar:expanded:v1';

// 모든 그룹을 페이지와 무관하게 기본적으로 펼쳐둔다 (오렌지 요청, 2026-07-31)

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SidebarContent({
  pathname,
  currentPlan,
  isGuest,
  isInDesktopApp,
  onNavigate,
  showFooterLinks = true,
}: {
  pathname: string;
  currentPlan: PlanTier;
  isGuest: boolean;
  isInDesktopApp: boolean;
  onNavigate: () => void;
  /** 공지사항/커뮤니티/성장후기/이용권/서비스소개 — 데스크탑에서는 헤더 우측 네비로 이동했으므로 숨김 */
  showFooterLinks?: boolean;
}) {
  const visibleFooterLinks = SIDEBAR_FOOTER_LINKS.filter(
    (link) => !(isInDesktopApp && DESKTOP_HIDDEN_HREFS.has(link.href)),
  );
  const activeHref = getActiveHref(pathname, ALL_NAV_HREFS);

  // 그룹별 접기/펼치기 상태 — 사용자가 직접 조작한 그룹만 localStorage에 override로 남긴다.
  // 명시적으로 건드리지 않은 그룹은 모두 기본적으로 펼쳐진다 (오렌지 요청, 2026-07-31).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_ACCORDION_KEY);
      if (raw) setOverrides(JSON.parse(raw));
    } catch {
      // localStorage 접근 불가 시 기본값(전체 펼침) 유지
    }
  }, []);

  const toggleGroup = (label: string, defaultOpen: boolean) => {
    setOverrides((prev) => {
      const current = prev[label] ?? defaultOpen;
      const next = { ...prev, [label]: !current };
      try {
        localStorage.setItem(SIDEBAR_ACCORDION_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패는 무시 — 다음 세션에 기본값으로 복원될 뿐
      }
      return next;
    });
  };

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <NavLink
          item={SIDEBAR_HOME}
          active={SIDEBAR_HOME.href === activeHref}
          currentPlan={currentPlan}
          isGuest={isGuest}
          onNavigate={onNavigate}
        />
        {SIDEBAR_GROUPS.map((group) => {
          const defaultOpen = true;
          const isOpen = overrides[group.label] ?? defaultOpen;
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label, defaultOpen)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide hover:bg-bg transition-colors cursor-pointer"
                style={{ color: '#BF8888' }}
              >
                <span className="truncate">{group.label}</span>
                <span className="ml-auto text-dim/60"><ChevronIcon open={isOpen} /></span>
              </button>
              <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="space-y-0.5 pt-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.label}
                        item={item}
                        active={item.href !== '#' && item.href === activeHref}
                        currentPlan={currentPlan}
                        isGuest={isGuest}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      {showFooterLinks && (
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
      )}
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
            showFooterLinks={false}
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
