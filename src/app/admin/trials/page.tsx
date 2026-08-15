'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDateTimeShort as formatDate } from '@/lib/format';

interface TrialUser {
  id: number;
  naver_id: string;
  blog_id: string | null;
  display_name: string | null;
  source: string;
  started_at: string;
  last_started_at: string;
  start_count: number;
  converted: boolean;
}

export default function AdminTrialsPage() {
  const [trials, setTrials] = useState<TrialUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTrials = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/trial-users?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTrials(data.trials || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchTrials(); }, [fetchTrials]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const convertedCount = trials.filter(t => t.converted).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="type-page-title mb-1">데모 체험</h1>
          <p className="text-xs text-dim">
            회원가입 없이 인플루언서 ID로 7일 무료 체험을 시작한 사용자 목록입니다.
          </p>
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim font-semibold mb-1">전체 체험자</p>
          <p className="text-xl font-black font-rank">{total.toLocaleString()}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim font-semibold mb-1">현재 페이지 가입 전환</p>
          <p className="text-xl font-black font-rank text-up">{convertedCount}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim font-semibold mb-1">현재 페이지 미전환</p>
          <p className="text-xl font-black font-rank text-down">{trials.length - convertedCount}</p>
        </div>
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="naver_id, blog_id, 이름으로 검색"
          className="flex-1 px-3 py-2 text-sm bg-bg border border-border rounded-lg outline-none focus:border-accent/40 transition-colors"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer"
        >
          검색
        </button>
      </form>

      {/* 목록 테이블 */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-dim text-sm">로딩 중...</div>
        ) : trials.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">데모 체험 사용자가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30 text-[11px] text-dim">
                <th className="text-left px-4 py-2.5 font-semibold">네이버 ID</th>
                <th className="text-left px-3 py-2.5 font-semibold">블로그 ID</th>
                <th className="text-left px-3 py-2.5 font-semibold">이름</th>
                <th className="text-left px-3 py-2.5 font-semibold">유형</th>
                <th className="text-center px-3 py-2.5 font-semibold">시작 횟수</th>
                <th className="text-left px-3 py-2.5 font-semibold">최초 시작</th>
                <th className="text-left px-3 py-2.5 font-semibold">최근 시작</th>
                <th className="text-center px-4 py-2.5 font-semibold">가입 전환</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {trials.map(t => (
                <tr key={t.id} className="hover:bg-bg/40">
                  <td className="px-4 py-2.5 font-semibold">{t.naver_id}</td>
                  <td className="px-3 py-2.5 text-dim">{t.blog_id || '-'}</td>
                  <td className="px-3 py-2.5">{t.display_name || '-'}</td>
                  <td className="px-3 py-2.5 text-dim">{t.source === 'influencer' ? '인플루언서' : '블로거'}</td>
                  <td className="px-3 py-2.5 text-center font-rank">{t.start_count}</td>
                  <td className="px-3 py-2.5 text-dim text-xs">{formatDate(t.started_at)}</td>
                  <td className="px-3 py-2.5 text-dim text-xs">{formatDate(t.last_started_at)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {t.converted ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-up/10 text-up">가입함</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dim/10 text-dim">미가입</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-bg/40 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            이전
          </button>
          <span className="text-sm text-dim">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-bg/40 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
