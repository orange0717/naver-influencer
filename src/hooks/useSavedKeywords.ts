'use client';
import { useEffect, useState, useCallback } from 'react';

export interface SavedKeywordMeta {
  monthly_pc?: number;
  monthly_mobile?: number;
  monthly_total?: number;
  competition?: string;
}

/**
 * 사용자의 저장된 키워드 목록을 Set 형태로 보관하고 토글하는 훅.
 * - 마운트 시 GET /api/my/saved-keywords 호출
 * - toggle(keyword, meta): 저장 상태에 따라 POST 또는 DELETE
 * - 401 응답 시 /login 으로 이동
 */
export function useSavedKeywords(enabled: boolean = true) {
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/my/saved-keywords');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSavedSet(new Set((data.keywords || []).map((k: { keyword: string }) => k.keyword)));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const toggle = useCallback(
    async (keyword: string, meta?: SavedKeywordMeta) => {
      const isSaved = savedSet.has(keyword);
      const redirectToLogin = () => {
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        alert('로그인이 필요한 기능입니다.');
        window.location.href = `/auth/login?redirect=${back}`;
      };
      if (isSaved) {
        const res = await fetch(`/api/my/saved-keywords?keyword=${encodeURIComponent(keyword)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setSavedSet((prev) => {
            const next = new Set(prev);
            next.delete(keyword);
            return next;
          });
        } else if (res.status === 401) {
          redirectToLogin();
        } else {
          const j = await res.json().catch(() => ({}));
          alert(j.error || '삭제에 실패했습니다.');
        }
      } else {
        const res = await fetch('/api/my/saved-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, ...(meta || {}) }),
        });
        if (res.ok) {
          setSavedSet((prev) => {
            const next = new Set(prev);
            next.add(keyword);
            return next;
          });
        } else if (res.status === 401) {
          redirectToLogin();
        } else {
          const j = await res.json().catch(() => ({}));
          alert(j.error || '저장에 실패했습니다.');
        }
      }
    },
    [savedSet]
  );

  return { savedSet, loading, toggle };
}
