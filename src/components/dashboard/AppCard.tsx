'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { DashboardApp, AppCategoryMeta, PlanTier } from '@/lib/dashboard-catalog';

const FAV_KEY_ANON = 'ninfl:dashboard:favorites:v1';
const FAV_KEY_USER_PREFIX = 'ninfl:dashboard:favorites:v1:';
const FAV_MIGRATED_PREFIX = 'ninfl:dashboard:favorites:migrated:v1:';

/** 로그인 계정별 키 — 계정 전환 시 이전 계정의 캐시를 절대 읽지 않도록 분리 */
function favKeyFor(syncKey: string | null): string {
  return syncKey ? `${FAV_KEY_USER_PREFIX}${syncKey}` : FAV_KEY_ANON;
}

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

function loadFavorites(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(key: string, next: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(next)));
  } catch {
    /* noop */
  }
}

/** 서버 목록과 기기 localStorage(해당 키)를 합집합 — 빈 응답(비인증·레이스)이 저장분을 지우지 않게 함 */
function mergeFavoritesWithLocal(key: string, serverIds: string[]): Set<string> {
  const next = new Set(loadFavorites(key));
  for (const id of serverIds) next.add(id);
  return next;
}

/**
 * 즐겨찾기 — 로그인=DB(GET/POST/DELETE) + localStorage 캐시 / 비로그인=localStorage만.
 * 로그인 첫 진입 시 localStorage → DB 1회 마이그레이션 (PUT, 계정 단위 once).
 */
export function useFavorites() {
  const { user } = useAuth();
  /** 세션 단위 동기화 키 (authId 우선 — /api/auth/me 의 id 는 네이버·블로그 식별자일 수 있음) */
  const syncKey = user?.authId || user?.id || null;
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const lastSyncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!syncKey) {
      setFavorites(loadFavorites(FAV_KEY_ANON));
      lastSyncedUserRef.current = null;
      return;
    }
    if (lastSyncedUserRef.current === syncKey) return;
    lastSyncedUserRef.current = syncKey;

    let cancelled = false;
    (async () => {
      const userKey = favKeyFor(syncKey);
      const migratedKey = `${FAV_MIGRATED_PREFIX}${syncKey}`;
      const alreadyMigrated = window.localStorage.getItem(migratedKey) === '1';
      if (!alreadyMigrated) {
        // 비로그인 상태에서 이 기기에 쌓인 즐겨찾기만 최초 1회 이 계정으로 이전
        const local = Array.from(loadFavorites(FAV_KEY_ANON));
        if (local.length > 0) {
          await fetch('/api/favorites', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appIds: local }),
            credentials: 'include',
          }).catch(() => {});
        }
        window.localStorage.setItem(migratedKey, '1');
        // 이전 후 즉시 비우기 — 다른 계정이 같은 기기에서 로그인할 때 이 데이터를 재사용하지 못하게 함
        window.localStorage.removeItem(FAV_KEY_ANON);
      }

      try {
        const r = await fetch('/api/favorites', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        const serverList = Array.isArray(j?.favorites) ? (j.favorites as string[]) : [];
        const next = mergeFavoritesWithLocal(userKey, serverList);
        setFavorites(next);
        saveFavorites(userKey, next);
      } catch {
        if (!cancelled) setFavorites(loadFavorites(userKey));
      }
    })();
    return () => { cancelled = true; };
  }, [syncKey]);

  const toggle = useCallback((id: string) => {
    const key = favKeyFor(syncKey);
    setFavorites(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id);
      else next.delete(id);
      saveFavorites(key, next);

      if (syncKey) {
        fetch('/api/favorites', {
          method: adding ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: id }),
          credentials: 'include',
        }).catch(() => {});
      }
      return next;
    });
  }, [syncKey]);

  return { favorites, toggle };
}

interface AppCardProps {
  app: DashboardApp;
  category: AppCategoryMeta;
  /** 현재 사용자 플랜 (잠금 판정) */
  currentPlan: PlanTier;
  /** 정식 로그인 또는 데모 세션 — false면 카드 탭 시 로그인으로 이동 */
  isLoggedIn: boolean;
  /** 데모 체험: 키워드 카테고리 앱은 유료 플랜 뱃지·잠금 표시 생략 */
  isDemoUser?: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (app: DashboardApp) => void;
  /** 개발 중(devPreview) 카드 클릭 시 — 네비게이션 차단하고 토스트 표시 */
  onDevPreview?: () => void;
}

export default function AppCard({
  app,
  category,
  currentPlan,
  isLoggedIn,
  isDemoUser = false,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onDevPreview,
}: AppCardProps) {
  const router = useRouter();
  const PLAN_RANK: Record<PlanTier, number> = { free: 0, blogger: 1, influencer: 2 };
  // 비로그인 미리보기에서는 유료 잠금 뱃지를 숨겨 모든 카드를 체험 가능한 모습으로 노출
  const locked =
    isLoggedIn &&
    !!app.requiredPlan &&
    PLAN_RANK[currentPlan] < PLAN_RANK[app.requiredPlan] &&
    !(isDemoUser && app.category === 'keyword');

  // 카드 하단 풀폭 라벨 (시각용, 클릭은 카드 전체에서 처리)
  const planTagLabel = app.devPreview
    ? '준비 중'
    : (app.ctaLabel || ctaForRequiredPlan(app.requiredPlan));

  const handleCardActivate = () => {
    // 개발 중 기능은 로그인 여부와 무관하게 진입 차단 + 토스트만 표시
    if (app.devPreview) {
      onDevPreview?.();
      return;
    }
    if (!isLoggedIn) {
      router.push(`/auth/login?redirect=${encodeURIComponent(app.href)}`);
      return;
    }
    onSelect(app);
  };

  return (
    <button
      type="button"
      onClick={handleCardActivate}
      className="group relative flex flex-col text-left bg-surface rounded-2xl border border-border p-3 lg:p-4 aspect-square transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-accent/40 cursor-pointer"
    >
      {/* 상단: 카테고리 태그 + 상태 뱃지 + 즐겨찾기 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${category.badgeClass}`}>
            {category.tag}
          </span>
          {app.devPreview && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-accent bg-accent/10 border border-accent/20 rounded-full">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
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
        {isLoggedIn && (
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
        )}
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
