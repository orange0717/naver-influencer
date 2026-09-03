'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { canAccess, planHighlight } from '@/lib/plan-access';
import { SIDEBAR_GROUPS, itemRequiredPlan, itemLocksNavigation, type SidebarItem } from '@/lib/sidebar-nav';
import { toPlanKey, type PlanKey } from '@/lib/plans';

interface SearchableItem extends SidebarItem {
  groupLabel: string;
}

const SEARCHABLE_ITEMS: SearchableItem[] = SIDEBAR_GROUPS.flatMap((group) =>
  group.items
    // 클릭 불가 소제목(heading: '블로그'/'인플루언서'/'리스트' 등)과 준비중 항목은 검색 대상에서 제외
    .filter((item) => !item.disabled && !item.heading)
    .map((item) => ({ ...item, groupLabel: group.label })),
);

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function HeaderSearch() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  const currentPlan: PlanKey = user.subscriptionActive
    ? toPlanKey(user.subscriptionPlan)
    : 'free';

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCHABLE_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  if (isLoading || !user.id) return null;

  const handleSelect = (item: SearchableItem) => {
    setOpen(false);
    // 티저 기능은 등급이 모자라도 화면을 열어야 하므로 구독 페이지로 돌리지 않는다.
    if (!canAccess(itemRequiredPlan(item), currentPlan) && itemLocksNavigation(item)) {
      router.push(`/subscribe?highlight=${planHighlight(itemRequiredPlan(item)!)}`);
      return;
    }
    router.push(item.href);
  };

  return (
    <div ref={rootRef} className="relative shrink-0 hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="메뉴 검색"
        title="메뉴 검색"
        className="flex items-center justify-center w-8 h-8 rounded-lg text-text-2 hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <SearchIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-border bg-surface shadow-lg overflow-hidden z-[100]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메뉴 검색"
            className="w-full px-4 py-3 text-sm text-text bg-transparent border-b border-border focus:outline-none"
          />
          {query.trim() && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-dim">검색 결과가 없습니다.</p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.groupLabel + item.href + item.label}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-bg transition-colors cursor-pointer"
                  >
                    <span className="truncate">
                      <span className="text-dim">{item.groupLabel}</span>
                      <span className="mx-1 text-dim/50">›</span>
                      <span className="font-semibold text-text">{item.label}</span>
                    </span>
                    {!canAccess(itemRequiredPlan(item), currentPlan) && itemLocksNavigation(item) && (
                      <span className="shrink-0 text-[10px] font-bold text-dim/60 bg-bg px-1.5 py-0.5 rounded">잠김</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
