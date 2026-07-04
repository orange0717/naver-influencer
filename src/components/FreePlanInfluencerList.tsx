'use client';

import { useState, useEffect, useCallback } from 'react';
import CategoryFilter from '@/components/CategoryFilter';

interface FreePlanItem {
  name: string;
  profileUrl: string;
  selectionDate: string | null;
  subject: string;
}

// 네이버 선정일 전용: 네이버는 UTC 기준 날짜로 선정일을 표기하므로 UTC 기준으로 출력
function formatNaverDate(d: string | null): string {
  if (!d) return '—';
  const isDateOnly = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const date = isDateOnly ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function FreePlanInfluencerList() {
  const [items, setItems] = useState<FreePlanItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', order });
      if (category !== '전체') params.set('category', category);
      params.set('_ts', String(Date.now()));

      const res = await fetch(`/api/influencers/free-plan?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
      const data = await res.json();

      setItems(data.items || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('무료 플랜 인플루언서 명단 로드 실패:', err);
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, category, order]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-dim px-0.5 leading-relaxed">
        이름·프로필 링크·선정일자·주제를 담은 무료 플랜 대상자 명단입니다. 팬수·챌린지 데이터는 포함되지 않습니다.
      </p>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CategoryFilter categories={categories} selected={category} onChange={handleCategoryChange} size="sm" />
        <span className="text-xs text-dim font-rank shrink-0">
          {loading ? '수집 중...' : `${total.toLocaleString()}명`}
        </span>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
          <button onClick={() => fetchData()} className="mt-2 text-xs text-accent hover:underline cursor-pointer">다시 시도</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">명단을 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs w-14">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">이름</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">프로필 링크</th>
                  <th
                    className="text-left py-3 px-4 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors"
                    onClick={() => { setOrder(prev => prev === 'desc' ? 'asc' : 'desc'); setPage(1); }}
                  >
                    선정 일자{order === 'desc' ? ' ↓' : ' ↑'}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">주제</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-bold font-rank text-xs text-dim">
                      {(page - 1) * 50 + i + 1}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-text">{it.name || '-'}</td>
                    <td className="py-3 px-4 text-xs">
                      {it.profileUrl ? (
                        <a href={it.profileUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          바로가기
                        </a>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-xs text-text">{formatNaverDate(it.selectionDate)}</td>
                    <td className="py-3 px-4 text-xs font-semibold text-text">{it.subject || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">표시할 명단이 없습니다.</div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                이전
              </button>
              <span className="text-xs text-dim px-2">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
