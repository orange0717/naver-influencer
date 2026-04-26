'use client';
import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export interface SavedKeywordMeta {
  monthly_pc?: number;
  monthly_mobile?: number;
  monthly_total?: number;
  competition?: string;
}

/**
 * 사용자의 저장된 키워드 목록을 Set 형태로 보관하고 토글하는 훅.
 * - 마운트 시 GET /api/my/saved-keywords 로 동기화
 * - toggle(keyword, meta): 저장 상태에 따라 POST 또는 DELETE
 * - supabase access_token 을 Authorization: Bearer 로 명시 첨부 (쿠키 누락 환경 대비)
 * - 401/403 시 alert 만 표시 — 페이지 자동 이동 없음
 */
export function useSavedKeywords(enabled: boolean = true) {
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  /** 현재 supabase 세션의 access_token 을 가져와 Authorization 헤더 객체로 반환 */
  const buildAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const auth = await buildAuthHeaders();
        const res = await fetch('/api/my/saved-keywords', {
          credentials: 'include',
          headers: { ...auth },
        });
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
      const handleAuthError = (status: number) => {
        if (status === 401) {
          alert('로그인이 필요한 기능입니다. 우측 상단의 로그인 버튼으로 로그인해주세요.');
        } else if (status === 403) {
          alert('이 계정은 키워드 저장 기능을 이용할 수 없습니다.');
        }
      };
      try {
        const auth = await buildAuthHeaders();
        if (isSaved) {
          const res = await fetch(`/api/my/saved-keywords?keyword=${encodeURIComponent(keyword)}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { ...auth },
          });
          if (res.ok) {
            setSavedSet((prev) => {
              const next = new Set(prev);
              next.delete(keyword);
              return next;
            });
          } else if (res.status === 401 || res.status === 403) {
            handleAuthError(res.status);
          } else {
            const j = await res.json().catch(() => ({}));
            alert(`(${res.status}) ${j.error || '삭제에 실패했습니다.'}`);
          }
        } else {
          const res = await fetch('/api/my/saved-keywords', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...auth },
            body: JSON.stringify({ keyword, ...(meta || {}) }),
          });
          if (res.ok) {
            setSavedSet((prev) => {
              const next = new Set(prev);
              next.add(keyword);
              return next;
            });
          } else if (res.status === 401 || res.status === 403) {
            handleAuthError(res.status);
          } else {
            const j = await res.json().catch(() => ({}));
            alert(`(${res.status}) ${j.error || '저장에 실패했습니다.'}`);
          }
        }
      } catch (err) {
        console.error('[useSavedKeywords] toggle error:', err);
        alert('네트워크 오류로 저장에 실패했습니다.');
      }
    },
    [savedSet]
  );

  return { savedSet, loading, toggle };
}
