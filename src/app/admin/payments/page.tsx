'use client';

import { useState, useEffect, useCallback } from 'react';
import { controlBoxClass, filterButtonClass } from '@/components/analytics/controls';

interface Payment {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  plan_name: string;
  duration_days: number;
  status: string;
  user_nickname: string | null;
  user_email: string | null;
  created_at: string;
}

interface Summary {
  subscribers: number;
  expiringSoon: number;
  totalRevenue: number;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/payments?${params}`);
    const data = await res.json();
    setPayments(data.payments || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setSummary(data.summary || null);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div className="space-y-6">
      <h1 className="type-page-title">결제 관리</h1>

      {/* 구독 현황 요약 */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-border p-4 text-center">
            <p className="text-xs text-dim mb-1">유료 구독자</p>
            <p className="text-2xl font-extrabold font-rank text-accent">{summary.subscribers}명</p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-4 text-center">
            <p className="text-xs text-dim mb-1">7일 내 만료 예정</p>
            <p className={`text-2xl font-extrabold font-rank ${summary.expiringSoon > 0 ? 'text-down' : 'text-text'}`}>
              {summary.expiringSoon}명
            </p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-4 text-center">
            <p className="text-xs text-dim mb-1">총 매출</p>
            <p className="text-2xl font-extrabold font-rank">{summary.totalRevenue.toLocaleString()}원</p>
          </div>
        </div>
      )}

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="주문ID, 사용자ID 검색"
          className={`${controlBoxClass} flex-1`}
        />
        <button type="submit" className={filterButtonClass}>
          검색
        </button>
      </form>

      {/* 결제 내역 테이블 */}
      <div className="bg-surface rounded-xl border border-border overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-3 py-2.5 font-semibold">사용자</th>
                <th className="text-left px-3 py-2.5 font-semibold">주문ID</th>
                <th className="text-center px-3 py-2.5 font-semibold">플랜</th>
                <th className="text-right px-3 py-2.5 font-semibold">금액</th>
                <th className="text-center px-3 py-2.5 font-semibold">기간</th>
                <th className="text-center px-3 py-2.5 font-semibold">상태</th>
                <th className="text-right px-3 py-2.5 font-semibold">결제일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-surface-hover transition">
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-semibold">{p.user_nickname || '-'}</p>
                    <p className="text-[10px] text-dim">{p.user_email || p.user_id}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-dim font-mono">{p.order_id}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                      {p.plan_name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-rank font-semibold">{p.amount.toLocaleString()}원</td>
                  <td className="px-3 py-2.5 text-center text-xs text-dim">{p.duration_days}일</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.status === 'PAID' ? 'text-up bg-up/10' :
                      p.status === 'CANCELED' ? 'text-down bg-down/10' :
                      'text-dim bg-bg'
                    }`}>
                      {p.status === 'PAID' ? '결제완료' : p.status === 'CANCELED' ? '취소' : p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-dim">결제 내역 없음</td></tr>
              )}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-border">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1 rounded text-xs font-semibold border border-border disabled:opacity-30 cursor-pointer">이전</button>
            <span className="text-xs text-dim">{page} / {totalPages} (총 {total}건)</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1 rounded text-xs font-semibold border border-border disabled:opacity-30 cursor-pointer">다음</button>
          </div>
        )}
      </div>
    </div>
  );
}
