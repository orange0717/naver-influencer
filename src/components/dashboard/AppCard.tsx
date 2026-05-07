'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardApp, AppCategoryMeta, PlanTier } from '@/lib/dashboard-catalog';

const FAV_KEY = 'ninfl:dashboard:favorites:v1';

function planLabel(plan: PlanTier): string {
  if (plan === 'influencer') return '인플루언서';
  if (plan === 'blogger') return '예비 인플루언서 +';
  return '';
}

function ctaForRequiredPlan(plan?: PlanTier): string {
  if (plan === 'influencer') return '인플루언서 플랜';
  if (plan === 'blogger') return '예비 인플루언서 + 플랜';
  return '무료플랜';
}

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(next: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(next)));
  } catch {
    /* noop */
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const toggle = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);

  return { favorites, toggle };
}

interface AppCardProps {
  app: DashboardApp;
  category: AppCategoryMeta;
  /** 현재 사용자 플랜 (잠금 판정) */
  currentPlan: PlanTier;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (app: DashboardApp) => void;
}

export default function AppCard({
  app,
  category,
  currentPlan,
  isFavorite,
  onToggleFavorite,
  onSelect,
}: AppCardProps) {
  const PLAN_RANK: Record<PlanTier, number> = { free: 0, blogger: 1, influencer: 2 };
  const locked =
    !!app.requiredPlan && PLAN_RANK[currentPlan] < PLAN_RANK[app.requiredPlan];

  // 카드 하단 풀폭 라벨 (시각용, 클릭은 카드 전체에서 처리)
  const planTagLabel = app.devPreview
    ? '준비 중'
    : (app.ctaLabel || ctaForRequiredPlan(app.requiredPlan));

  return (
    <button
      type="button"
      onClick={() => onSelect(app)}
      className="group relative flex flex-col text-left bg-surface rounded-2xl border border-border p-3 lg:p-4 aspect-square transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-accent/40 cursor-pointer"
    >
      {/* 상단: 카테고리 태그 + 상태 뱃지 + 즐겨찾기 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${category.badgeClass}`}>
            {category.tag}
          </span>
          {app.devPreview && (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-dim bg-bg border border-border rounded-full">
              개발 중
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-accent bg-accent/10 border border-accent/20 rounded-full">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                <path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
              {planLabel(app.requiredPlan!)}
            </span>
          )}
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(app.id);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(app.id);
            }
          }}
          aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          className="p-1 -mr-1 -mt-1 rounded-full text-dim hover:text-accent hover:bg-accent/5 transition-colors cursor-pointer shrink-0"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            className={isFavorite ? 'text-accent' : ''}
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </span>
      </div>

      {/* 제목 (설명은 모달로 이전) */}
      <div className={`mb-3 transition-opacity ${app.devPreview ? 'opacity-50 group-hover:opacity-100' : ''}`}>
        <h3 className="font-title font-bold text-sm lg:text-base text-text leading-snug line-clamp-2">
          {app.title}
        </h3>
      </div>

      {/* 풀폭 플랜 라벨 (시각용) */}
      <span
        className={`mt-auto w-full inline-flex items-center justify-center py-1.5 lg:py-2 rounded-xl text-[11px] lg:text-xs font-bold transition-all ${category.buttonClass} ${app.devPreview ? 'opacity-50 group-hover:opacity-100' : locked ? 'opacity-90' : ''}`}
      >
        {planTagLabel}
      </span>
    </button>
  );
}
