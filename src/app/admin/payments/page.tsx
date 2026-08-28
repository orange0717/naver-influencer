'use client';

import { useState, useEffect, useCallback } from 'react';
import { controlBoxClass, filterButtonClass } from '@/components/analytics/controls';
import Pagination from '@/components/analytics/Pagination';

/**
 * ⚠️ 이 인터페이스는 2026-05-03 PortOne 재구성 이전 스키마(order_id·plan_name·duration_days)를
 *    그대로 들고 있었다. 라우트가 삭제된 채였으니 어긋난 것도 드러나지 않았다.
 *    2026-08-28 라우트 복구와 함께 현재 payment_transactions 스키마에 맞춘다.
 */
interface Payment {
  id: string;
  user_id: string;
  /** PortOne paymentId (옛 order_id 자리) */
  payment_id: string;
  plan_key: string;
  /** 플랜 표시명. 정의가 없는 옛 키면 서버가 plan_key 를 그대로 넣어 보낸다. */
  plan_name: string;
  /** 플랜 기간(개월). 정의를 못 찾으면 null — 이때 기간을 지어내지 않는다. */
  months: number | null;
  amount: number;
  status: string;
  /** 'CARD' | 'BILLING_KEY' 등. 기록이 없으면 null. */
  pay_method: string | null;
  /** 'initial' | 'recurring' | 'manual' */
  charge_type: string;
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
  /** 조회 자체가 실패했는가. '결제 내역 없음'과 반드시 구분해야 하는 상태다. */
  const [loadError, setLoadError] = useState('');

  // 예전에는 res.ok 도 안 보고 예외도 안 잡아서, 조회가 실패하면 payments 가 [] 로 남고
  // 화면에는 "결제 내역 없음"이 떴다. 매출 화면에서 그건 '아무도 결제하지 않았다'로
  // 읽힌다 — 실제로는 못 불러온 것이다. 네트워크 예외 때는 loading 이 true 로 굳어
  // 스피너가 영원히 돌기까지 했다.
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/admin/payments?${params}`);
      if (!res.ok) {
        setLoadError(`결제 내역을 불러오지 못했습니다. (오류 ${res.status})`);
        return;
      }
      const data = await res.json();
      setPayments(data.payments || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSummary(data.summary || null);
    } catch {
      setLoadError('결제 내역을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
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

      {/* 구독 현황 요약. 서버가 요약 집계에 실패하면 summary=null 로 온다 — 그때 0명·0원을
          그리면 '구독자가 없다'는 거짓이 되므로, 못 구했다고 말하고 카드는 비운다. */}
      {!loading && !loadError && !summary && (
        <p className="text-xs text-dim">구독 현황 요약을 불러오지 못했습니다. 아래 결제 내역은 정상입니다.</p>
      )}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface rounded-lg border border-border p-4 text-center">
            <p className="text-xs text-dim mb-1">유료 구독자</p>
            <p className="text-2xl font-extrabold font-rank text-accent">{summary.subscribers}명</p>
          </div>
          <div className="bg-surface rounded-lg border border-border p-4 text-center">
            <p className="text-xs text-dim mb-1">7일 내 만료 예정</p>
            <p className={`text-2xl font-extrabold font-rank ${summary.expiringSoon > 0 ? 'text-down' : 'text-text'}`}>
              {summary.expiringSoon}명
            </p>
          </div>
          <div className="bg-surface rounded-lg border border-border p-4 text-center">
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
      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : loadError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-down">{loadError}</p>
            <button
              type="button"
              onClick={fetchPayments}
              className="text-sm text-accent hover:underline cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-3 py-2.5 font-semibold">사용자</th>
                <th className="text-left px-3 py-2.5 font-semibold">결제ID</th>
                <th className="text-center px-3 py-2.5 font-semibold">플랜</th>
                <th className="text-right px-3 py-2.5 font-semibold">금액</th>
                <th className="text-center px-3 py-2.5 font-semibold">기간</th>
                <th className="text-center px-3 py-2.5 font-semibold">청구</th>
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
                  <td className="px-3 py-2.5 text-xs text-dim font-mono">{p.payment_id}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full"
                      title={p.plan_key}
                    >
                      {p.plan_name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-rank font-semibold">{p.amount.toLocaleString()}원</td>
                  {/* 플랜 정의를 못 찾으면 기간을 지어내지 않는다. */}
                  <td className="px-3 py-2.5 text-center text-xs text-dim">
                    {p.months != null ? `${p.months}개월` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-dim">
                    {p.charge_type === 'initial' ? '최초' : p.charge_type === 'recurring' ? '자동' : '수동'}
                    {p.pay_method === 'BILLING_KEY' && <span className="ml-1 text-[10px]">(빌링키)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.status === 'PAID' ? 'text-up bg-up/10' :
                      p.status === 'CANCELLED' || p.status === 'CANCELED' ? 'text-down bg-down/10' :
                      p.status === 'FAILED' ? 'text-down bg-down/10' :
                      'text-dim bg-bg'
                    }`}>
                      {p.status === 'PAID' ? '결제완료'
                        : p.status === 'CANCELLED' || p.status === 'CANCELED' ? '취소'
                        : p.status === 'FAILED' ? '실패'
                        : p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-dim">결제 내역 없음</td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination page={page} totalPages={totalPages} onChange={setPage} note={`(총 ${total}건)`} />
      </div>
    </div>
  );
}
