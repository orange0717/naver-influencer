'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppCard, { useFavorites } from './AppCard';
import AppDetailModal from './AppDetailModal';
import {
  APP_CATEGORIES,
  DASHBOARD_APPS,
  type AppCategoryKey,
  type DashboardApp,
  type PlanTier,
} from '@/lib/dashboard-catalog';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  currentPlan: PlanTier;
  isLoggedIn: boolean;
  userName: string | null;
  subscriptionExpiresAt: string | null;
  stats: {
    myKeywordCount: number;
    myBlogRank: number | null;
    unreadNotices: number;
  };
}

function planName(plan: PlanTier): string {
  if (plan === 'influencer') return '인플루언서';
  if (plan === 'blogger') return '예비 인플루언서 +';
  return '무료플랜';
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '-';
  }
}

/** 카테고리 내 정렬 우선순위: 무료(0) → 블로거+(1) → 인플루언서(2) → 개발 중(3) */
function planSortKey(app: typeof DASHBOARD_APPS[number]): number {
  if (app.devPreview) return 3;
  if (app.requiredPlan === 'influencer') return 2;
  if (app.requiredPlan === 'blogger') return 1;
  return 0;
}

function sortAppsByPlan(apps: typeof DASHBOARD_APPS): typeof DASHBOARD_APPS {
  return [...apps].sort((a, b) => planSortKey(a) - planSortKey(b));
}

export default function DashboardGrid({
  currentPlan: serverPlan,
  isLoggedIn,
  userName,
  subscriptionExpiresAt,
  stats,
}: Props) {
  const { favorites, toggle } = useFavorites();
  const [query, setQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<DashboardApp | null>(null);
  const { user } = useAuth();

  // 클라이언트에서 /api/auth/me 로 로드된 최신 플랜으로 덮어쓰기 (서버 초기값 폴백)
  // 주의: /api/auth/me 의 쿠키 폴백 경로는 subscriptionPlan 을 응답에 포함하지 않음 (undefined).
  // 이 경우 SSR(serverPlan) 값을 유지해야 정확한 플랜이 보임.
  const currentPlan: PlanTier = (() => {
    if (user.subscriptionPlan === undefined) return serverPlan; // me API 가 구독 정보를 안 줬으면 SSR 값 유지
    if (user.subscriptionActive && user.subscriptionPlan === 'INFLUENCER') return 'influencer';
    if (user.subscriptionActive && user.subscriptionPlan === 'BLOGGER') return 'blogger';
    if (user.id) return 'free'; // 로그인 됐지만 유료 구독 없음/만료
    return serverPlan; // 비로그인 시 서버값 유지
  })();

  const categoryMap = useMemo(
    () => Object.fromEntries(APP_CATEGORIES.map(c => [c.key, c])) as Record<AppCategoryKey, (typeof APP_CATEGORIES)[number]>,
    [],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filterApps = (apps: typeof DASHBOARD_APPS) => {
    if (!normalizedQuery) return apps;
    return apps.filter(app =>
      app.title.toLowerCase().includes(normalizedQuery) ||
      app.description.toLowerCase().includes(normalizedQuery),
    );
  };

  const favoriteApps = DASHBOARD_APPS.filter(app => favorites.has(app.id));
  const visibleFavorites = sortAppsByPlan(filterApps(favoriteApps));

  const greeting = userName ? `@${userName} 님,` : '반갑습니다,';

  return (
    <div className="flex flex-col gap-8">
      {/* ── 베타 안내 배너 ── */}
      <div className="flex items-center gap-2 px-3 py-2 lg:px-4 lg:py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs lg:text-sm font-semibold">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>현재 베타버전 프로그램입니다.</span>
      </div>

      {/* ── 상단 인사 + 구독 + 지표 ── */}
      <section className="bg-header rounded-2xl p-4 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-xs lg:text-sm text-white/80 font-semibold mb-1.5 lg:mb-2">N인플 대시보드</p>
            <h1 className="font-title font-black text-sm lg:text-2xl text-white leading-relaxed">
              블로그 분석부터 키워드챌린지, 글 피드백까지
              <br />
              네이버 블로그 All in one 플랫폼.
            </h1>
          </div>
          <div className="flex items-center gap-2 lg:gap-3 justify-end">
            <div className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl bg-white/15 border border-white/25">
              <p className="text-[10px] lg:text-[11px] text-white/80 font-semibold">현재 플랜</p>
              <p className="text-xs lg:text-sm font-bold text-white">{planName(currentPlan)}</p>
            </div>
            {subscriptionExpiresAt && (
              <div className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl bg-white/15 border border-white/25">
                <p className="text-[10px] lg:text-[11px] text-white/80 font-semibold">만료일</p>
                <p className="text-xs lg:text-sm font-bold text-white">{formatDate(subscriptionExpiresAt)}</p>
              </div>
            )}
            <Link
              href="/subscribe"
              className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl bg-white text-accent-hover text-xs lg:text-sm font-bold hover:bg-white/90 transition-colors"
            >
              이용권
            </Link>
          </div>
        </div>

        {/* 빠른 지표 4개 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3 mt-4 lg:mt-6">
          <div className="bg-white/15 border border-white/25 rounded-xl p-3 lg:p-4">
            <p className="text-[10px] lg:text-xs text-white/80 font-semibold mb-0.5 lg:mb-1">내 블로그 순위</p>
            <p className="text-sm lg:text-xl font-black text-white">
              {stats.myBlogRank !== null ? `${stats.myBlogRank.toLocaleString()}위` : '-'}
            </p>
          </div>
          <div className="bg-white/15 border border-white/25 rounded-xl p-3 lg:p-4">
            <p className="text-[10px] lg:text-xs text-white/80 font-semibold mb-0.5 lg:mb-1">관심 키워드</p>
            <p className="text-sm lg:text-xl font-black text-white">{stats.myKeywordCount.toLocaleString()}개</p>
          </div>
          <div className="bg-white/15 border border-white/25 rounded-xl p-3 lg:p-4">
            <p className="text-[10px] lg:text-xs text-white/80 font-semibold mb-0.5 lg:mb-1">읽지 않은 공지</p>
            <p className="text-sm lg:text-xl font-black text-white">{stats.unreadNotices.toLocaleString()}건</p>
          </div>
          <div className="bg-white/15 border border-white/25 rounded-xl p-3 lg:p-4">
            <p className="text-[10px] lg:text-xs text-white/80 font-semibold mb-0.5 lg:mb-1">즐겨찾는 기능</p>
            <p className="text-sm lg:text-xl font-black text-white">{favorites.size.toLocaleString()}개</p>
          </div>
        </div>
      </section>

      {/* ── 대시보드 스티키 내비 (카테고리 칩 바) ── */}
      <nav
        aria-label="대시보드 카테고리 내비게이션"
        className="sticky top-14 z-30 -mx-4 px-4 py-2.5 bg-bg/90 backdrop-blur-md border-y border-border"
      >
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-2 lg:overflow-x-auto lg:flex-nowrap scrollbar-hide">
          <button
            type="button"
            onClick={() => document.getElementById('section-favorites')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label="즐겨찾기 섹션으로 이동"
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs lg:text-sm font-bold hover:bg-accent/20 transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={visibleFavorites.length > 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true" className="lg:w-[14px] lg:h-[14px]">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            즐겨찾기
            <span className="text-[10px] lg:text-[11px] font-bold opacity-80">{visibleFavorites.length}</span>
          </button>
          {APP_CATEGORIES.map(cat => {
            const count = filterApps(DASHBOARD_APPS.filter(a => a.category === cat.key)).length;
            if (count === 0) return null;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => document.getElementById(`section-${cat.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-full border border-border bg-surface text-text text-xs lg:text-sm font-semibold hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                {cat.label}
                <span className="text-[10px] lg:text-[11px] font-bold text-dim">{count}</span>
              </button>
            );
          })}
          <div className="ml-auto shrink-0 relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="기능 검색"
              className="w-32 sm:w-56 pl-7 lg:pl-8 pr-3 py-1 lg:py-1.5 rounded-full border border-border bg-surface text-xs lg:text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      </nav>

      {/* ── 즐겨찾기 섹션 ── */}
      <section id="section-favorites" className="scroll-mt-28 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-accent lg:w-[18px] lg:h-[18px]" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <h2 className="font-title font-bold text-base lg:text-lg text-text">즐겨찾기</h2>
          <span className="text-xs lg:text-sm text-dim">({visibleFavorites.length})</span>
        </div>
        {visibleFavorites.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            {visibleFavorites.map(app => (
              <AppCard
                key={app.id}
                app={app}
                category={categoryMap[app.category]}
                currentPlan={currentPlan}
                isFavorite
                onToggleFavorite={toggle}
                onSelect={setSelectedApp}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 lg:p-8 text-center">
            <p className="text-xs lg:text-sm text-dim leading-relaxed">
              아직 즐겨찾기한 기능이 없습니다. 각 카드 우상단의{' '}
              <span className="inline-flex items-center align-middle mx-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </span>{' '}
              하트를 눌러 자주 쓰는 기능을 모아보세요.
            </p>
          </div>
        )}
      </section>

      {/* ── 카테고리 섹션 ── */}
      {APP_CATEGORIES.map(cat => {
        const catApps = sortAppsByPlan(filterApps(DASHBOARD_APPS.filter(a => a.category === cat.key)));
        if (catApps.length === 0) return null;
        return (
          <section key={cat.key} id={`section-${cat.key}`} className="scroll-mt-28 pt-6 border-t border-border">
            <div className="mb-3">
              <div className="flex items-baseline gap-2 lg:gap-3">
                <h2 className="font-title font-bold text-base lg:text-lg text-text">{cat.label}</h2>
                <span className="hidden sm:inline text-sm text-dim">{cat.description}</span>
                <span className="ml-auto text-xs lg:text-sm text-dim">({catApps.length})</span>
              </div>
              <p className="sm:hidden mt-0.5 text-[11px] text-dim leading-snug">{cat.description}</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
              {catApps.map(app => (
                <AppCard
                  key={app.id}
                  app={app}
                  category={cat}
                  currentPlan={currentPlan}
                  isFavorite={favorites.has(app.id)}
                  onToggleFavorite={toggle}
                  onSelect={setSelectedApp}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* ── 검색 결과 없음 ── */}
      {normalizedQuery &&
        APP_CATEGORIES.every(cat => filterApps(DASHBOARD_APPS.filter(a => a.category === cat.key)).length === 0) && (
          <div className="text-center py-12 text-dim">
            <p className="text-sm">&ldquo;{query}&rdquo;에 해당하는 기능이 없습니다.</p>
          </div>
        )}

      {/* ── 앱 상세 모달 ── */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          category={categoryMap[selectedApp.category]}
          currentPlan={currentPlan}
          isLoggedIn={isLoggedIn}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </div>
  );
}
