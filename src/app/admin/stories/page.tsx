'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export const dynamic = 'force-dynamic';

type Status = 'pending' | 'approved' | 'rejected';

interface AdminStory {
  id: string;
  title: string;
  content: string;
  short_excerpt: string | null;
  author_name: string;
  metric_before: string | null;
  metric_after: string | null;
  period: string | null;
  status: Status;
  is_featured: boolean;
  featured_order: number | null;
  view_count: number;
  created_at: string;
  reject_reason: string | null;
}

export default function AdminStoriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Status>('pending');
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/stories?status=${tab}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStories((data.stories || []) as AdminStory[]);
    } catch (err) {
      console.error('[admin/stories] load error:', err);
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [tab, getToken]);

  useEffect(() => {
    if (!authLoading && user.id) load();
  }, [authLoading, user.id, load]);

  async function patchStory(id: string, body: Record<string, unknown>) {
    const token = await getToken();
    const res = await fetch(`/api/stories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '처리 실패');
      return false;
    }
    return true;
  }

  async function handleApprove(id: string) {
    if (!confirm('승인하시겠습니까?')) return;
    if (await patchStory(id, { status: 'approved' })) load();
  }

  async function handleReject(id: string) {
    const reason = prompt('반려 사유 (선택):', '') ?? '';
    if (await patchStory(id, { status: 'rejected', reject_reason: reason })) load();
  }

  async function handleFeatureToggle(s: AdminStory) {
    const next = !s.is_featured;
    if (await patchStory(s.id, { is_featured: next })) load();
  }

  async function handleOrderChange(id: string, value: string) {
    const n = value.trim() === '' ? null : Math.max(0, Math.min(9999, Number(value) || 0));
    if (await patchStory(id, { featured_order: n })) load();
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까? (소프트 삭제)')) return;
    const token = await getToken();
    const res = await fetch(`/api/stories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      alert('삭제 실패');
      return;
    }
    load();
  }

  if (authLoading) {
    return <div className="text-center py-20 text-dim text-sm">로딩 중...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">성장 후기 관리</h1>
        <Link href="/stories" className="text-sm text-accent hover:underline">
          공개 페이지 →
        </Link>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(['pending', 'approved', 'rejected'] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === s ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-foreground'
            }`}
          >
            {s === 'pending' ? '승인 대기' : s === 'approved' ? '승인됨' : '반려됨'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-dim text-sm">로딩 중...</div>
      ) : stories.length === 0 ? (
        <div className="text-center py-20 text-dim text-sm">해당 상태의 후기가 없습니다.</div>
      ) : (
        <div className="space-y-4">
          {stories.map((s) => (
            <div key={s.id} className="bg-surface rounded-xl border border-border p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 text-xs text-dim">
                    <span>{s.author_name}</span>
                    <span>·</span>
                    <span>{new Date(s.created_at).toLocaleString('ko-KR')}</span>
                    <span>·</span>
                    <span>조회 {s.view_count}</span>
                  </div>
                  <h3 className="font-bold text-base">{s.title}</h3>
                  {s.short_excerpt && <p className="text-sm text-dim mt-1">{s.short_excerpt}</p>}
                </div>
              </div>

              {(s.metric_before || s.metric_after) && (
                <div className="flex items-center gap-2 text-xs mb-3">
                  {s.metric_before && <span className="px-2 py-0.5 rounded bg-border/40">{s.metric_before}</span>}
                  <span className="text-accent">→</span>
                  {s.metric_after && (
                    <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-semibold">
                      {s.metric_after}
                    </span>
                  )}
                  {s.period && <span className="text-dim">({s.period})</span>}
                </div>
              )}

              <details className="mb-3">
                <summary className="text-sm text-dim cursor-pointer hover:text-accent">본문 보기</summary>
                <div className="mt-2 p-3 bg-bg rounded border border-border text-sm whitespace-pre-wrap">
                  {s.content}
                </div>
              </details>

              {s.reject_reason && (
                <div className="text-xs text-red-600 mb-3">반려 사유: {s.reject_reason}</div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
                {tab === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApprove(s.id)}
                      className="px-3 py-1.5 bg-accent text-white text-sm font-semibold rounded hover:bg-accent-hover"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleReject(s.id)}
                      className="px-3 py-1.5 border border-border text-sm rounded hover:bg-border/20"
                    >
                      반려
                    </button>
                  </>
                )}

                {tab === 'approved' && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={s.is_featured}
                        onChange={() => handleFeatureToggle(s)}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                      랜딩 노출
                    </label>
                    {s.is_featured && (
                      <label className="flex items-center gap-2 text-sm text-dim">
                        정렬:
                        <input
                          type="number"
                          defaultValue={s.featured_order ?? ''}
                          onBlur={(e) => handleOrderChange(s.id, e.target.value)}
                          className="w-20 px-2 py-1 border border-border rounded bg-bg"
                          min={0}
                          max={9999}
                        />
                      </label>
                    )}
                  </>
                )}

                {tab === 'rejected' && (
                  <button
                    onClick={() => handleApprove(s.id)}
                    className="px-3 py-1.5 bg-accent text-white text-sm font-semibold rounded hover:bg-accent-hover"
                  >
                    재승인
                  </button>
                )}

                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-3 py-1.5 text-red-600 text-sm hover:bg-red-50 rounded ml-auto"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
