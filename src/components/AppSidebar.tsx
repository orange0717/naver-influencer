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
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

/** 모든 메뉴가 공유하는 좌측 여백 기준선 — indent 항목은 여기서 한 단계(pl-6)만 더 들어간다 */
function itemPadding(indent?: boolean) {
  return indent ? 'pl-6' : 'pl-[10px]';
}

/** 클릭 불가능한 소제목 — 그룹 내부 구간 구분용 (예: "리스트", "블로그"/"인플루언서") */
function NavHeading({ label, subgroup }: { label: string; subgroup?: boolean }) {
  // subgroup(블로그/인플루언서)은 두 하위그룹 경계를 분명히 하도록 더 굵고 진하게, 위 여백도 크게(스펙 24항).
  if (subgroup) {
    return (
      <div className="flex items-center gap-1.5 pl-[10px] pr-3 pt-3 pb-1 first:pt-0.5">
        <span className="w-1 h-1 rounded-full bg-accent shrink-0" aria-hidden="true" />
        <span className="text-[12px] font-medium text-text-2 tracking-wide truncate">{label}</span>
      </div>
    );
  }
  return (
    <div className={`${itemPadding(false)} pr-3 pt-1.5 pb-0.5 text-[12px] font-normal text-dim tracking-wide truncate`}>
      {label}
    </div>
  );
}

/** 점(•) + 라벨 — bullet 항목만 점이 붙는다 */
function ItemLabel({ item }: { item: SidebarItem }) {
  return (
    <span className="truncate">
      {item.bullet && <span className="text-[#A36B63] font-bold mr-1.5" aria-hidden="true">•</span>}
      {item.label}
    </span>
  );
}

function NavLink({
  item,
  active,
  currentPlan,
  isGuest,
  authPending,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  currentPlan: PlanTier;
  isGuest: boolean;
  /** 인증 조회가 아직 안 끝났거나 백엔드 장애 — 권한을 모르는 상태 */
  authPending: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { openGate } = useMemberOnlyGate();
  const padding = itemPadding(item.indent);
  // 크기보다 색/들여쓰기로 계층을 표현한다. 기준선은 14px, 하위 메뉴만 한 단계 낮춘다.
  const sizeClass = item.indent ? 'text-[13px]' : 'text-[14px]';
  const padY = item.indent ? 'py-1.5' : 'py-2';
  const inactiveColor = item.indent ? 'text-desc' : 'text-text-2';

  if (item.heading) {
    return <NavHeading label={item.label} subgroup={item.subgroup} />;
  }

  if (item.disabled) {
    return (
      <span className={`flex items-center gap-2 ${padding} pr-3 ${padY} rounded-lg ${sizeClass} text-dim/50 border-l-2 border-transparent cursor-not-allowed`}>
        {item.label}
        <span className="ml-auto text-[10px] font-normal text-dim bg-sunken px-1.5 py-0.5 rounded-sm">준비중</span>
      </span>
    );
  }

  // 비회원(로그인·데모 모두 아님): 회원 전용 메뉴는 라우팅 대신 회원 전용 모달로 유도
  if (item.authOnly && isGuest && !authPending) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          openGate(item.href);
        }}
        className={`w-full flex items-center gap-2 ${padding} pr-3 ${padY} rounded-lg ${sizeClass} font-normal text-dim border-l-2 border-transparent hover:bg-surface-hover hover:text-text transition-colors text-left cursor-pointer`}
      >
        <ItemLabel item={item} />
        <span className="ml-auto text-dim/60"><LockIcon /></span>
      </button>
    );
  }

  // 권한을 아직 모르는 동안 잠금으로 그리면 구독자에게 자물쇠가 번쩍인다 → 평범한 링크로 두고 페이지 자체 게이트에 맡긴다
  const locked = !authPending && !canAccess(item.requiredPlan, currentPlan);

  if (locked) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          router.push(`/subscribe?highlight=${planHighlight(item.requiredPlan!)}`);
        }}
        className={`w-full flex items-center gap-2 ${padding} pr-3 ${padY} rounded-lg ${sizeClass} font-normal text-dim border-l-2 border-transparent hover:bg-surface-hover hover:text-text transition-colors text-left cursor-pointer`}
      >
        <ItemLabel item={item} />
        <span className="ml-auto text-accent"><LockIcon /></span>
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2 ${padding} pr-3 ${padY} rounded-lg ${sizeClass} border-l-2 transition-colors ${
        active
          ? 'bg-accent/15 text-accent border-accent font-medium'
          : `${inactiveColor} border-transparent font-normal hover:text-text hover:bg-surface-hover`
      }`}
    >
      <ItemLabel item={item} />
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
  authPending,
  isInDesktopApp,
  onNavigate,
  showFooterLinks = true,
}: {
  pathname: string;
  currentPlan: PlanTier;
  isGuest: boolean;
  authPending: boolean;
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
      {/* "AI 서비스"가 아니라 데이터 분석 툴이라는 정체성을 사이드바 상단에서도 짧게 각인 (2026-08-09) */}
      <p className="lg:hidden px-[10px] pt-2 pb-0.5 text-[11px] font-medium text-dim tracking-wide">
        네이버 검색 데이터 분석
      </p>
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-2">
        <NavLink
          item={SIDEBAR_HOME}
          active={SIDEBAR_HOME.href === activeHref}
          currentPlan={currentPlan}
          isGuest={isGuest}
          authPending={authPending}
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
                className="w-full flex items-center gap-1 px-3 py-2 rounded-md text-[13px] font-bold tracking-wide text-[#A36B63] hover:text-[#8C4A42] transition-colors cursor-pointer"
              >
                <span className="truncate">{group.label}</span>
                <span className="ml-auto text-dim/60"><ChevronIcon open={isOpen} /></span>
              </button>
              <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="space-y-0.5 pt-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={item.href !== '#' && item.href === activeHref}
                        currentPlan={currentPlan}
                        isGuest={isGuest}
                        authPending={authPending}
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
        <div className="border-t border-border p-2.5 space-y-0.5 shrink-0">
          {visibleFooterLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={`block px-3 py-1.5 rounded-md text-[13px] font-normal transition-colors ${
                pathname.startsWith(link.href) ? 'text-accent' : 'text-desc hover:text-text'
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
  const { user, isLoading, isError } = useAuth();
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

  if (hidden) return null;

  // 인증 조회 지연·백엔드 장애 때 사이드바를 통째로 감추면 화면이 무너지고 이동 수단이 사라진다.
  // 권한을 모르는 동안에는 잠금 표시 없이 메뉴만 그대로 띄운다.
  const authPending = isLoading || isError;

  // 비회원 — 메뉴는 보이되 회원 전용 항목은 클릭 시 모달로 유도
  const isGuest = !user.id;

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
        className={`hidden lg:flex flex-col shrink-0 sticky top-16 z-30 h-[calc(100vh-4rem)] bg-sidebar border-r border-border transition-[width] duration-200 ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        {collapsed ? (
          <nav className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1">
            <Link
              href="/"
              title={SIDEBAR_HOME.label}
              className={`w-9 h-9 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                pathname === '/' ? 'bg-accent/15 text-accent' : 'text-desc hover:text-text hover:bg-surface-hover'
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
                className="w-9 h-9 flex items-center justify-center rounded-md text-[11px] font-bold text-[#A36B63] hover:text-[#8C4A42] hover:bg-surface-hover transition-colors cursor-pointer"
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
            authPending={authPending}
            isInDesktopApp={isInDesktopApp}
            onNavigate={() => {}}
            showFooterLinks={false}
          />
        )}
        {/* 사이드바 오른쪽 경계에 걸쳐 있는 세로형 접기/펼치기 버튼 */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? '펼치기' : '접기'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className={`absolute top-1/2 -translate-y-1/2 -right-3 z-10 flex items-center justify-center rounded-full border border-border shadow-xs transition-colors cursor-pointer w-6 h-6 bg-surface text-desc hover:text-text hover:bg-surface-hover ${
            collapsed ? 'w-7 h-7' : ''
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
          </svg>
        </button>
      </aside>

      {/* ── 모바일 오버레이 ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-16 z-40 flex flex-col bg-sidebar border-t border-border">
          <SidebarContent
            pathname={pathname}
            currentPlan={currentPlan}
            isGuest={isGuest}
            authPending={authPending}
            isInDesktopApp={isInDesktopApp}
            onNavigate={closeMobile}
          />
        </div>
      )}
    </>
  );
}
