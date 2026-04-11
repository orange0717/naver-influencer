'use client';

import { useState, useEffect } from 'react';

interface Settlement {
  id: string;
  order_date: string | null;
  settled_date: string;
  client_name: string;
  fee: number;
  commission: number;
  net_amount: number;
  posting_deadline: string | null;
}

export default function AdSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my/ad-settlements')
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => setSettlements(data.settlements || []))
      .catch((err) => {
        console.warn('[AdSettlements] fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalFee = settlements.reduce((sum, s) => sum + s.fee, 0);
  const pendingCount = settlements.filter(s => !s.settled_date).length;
  const completedCount = settlements.filter(s => !!s.settled_date).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-bg rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-border/40 rounded w-16 mb-2" />
              <div className="h-5 bg-border/40 rounded w-20" />
            </div>
          ))}
        </div>
        <div className="h-32 bg-bg rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg rounded-xl p-4">
          <p className="text-[11px] text-dim font-medium mb-1">총 원고료</p>
          <p className="text-lg font-bold">{totalFee.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></p>
        </div>
        <div className="bg-bg rounded-xl p-4">
          <p className="text-[11px] text-dim font-medium mb-1">완료</p>
          <p className="text-lg font-bold text-up">{completedCount}<span className="text-xs text-dim font-normal ml-0.5">건</span></p>
        </div>
        <div className="bg-bg rounded-xl p-4">
          <p className="text-[11px] text-dim font-medium mb-1">대기</p>
          <p className="text-lg font-bold text-gold">{pendingCount}<span className="text-xs text-dim font-normal ml-0.5">건</span></p>
        </div>
      </div>

      {/* 데스크톱 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-dim">
              <th className="text-left py-2.5 px-3 font-semibold">일자</th>
              <th className="text-left py-2.5 px-3 font-semibold">광고주</th>
              <th className="text-right py-2.5 px-3 font-semibold">원고금액</th>
              <th className="text-center py-2.5 px-3 font-semibold">포스팅 기한일자</th>
              <th className="text-center py-2.5 px-3 font-semibold">정산일자</th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-16 text-sm text-dim">
                  <div className="space-y-2">
                    <svg className="mx-auto w-10 h-10 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                    <p>아직 정산내역이 없습니다</p>
                    <p className="text-xs text-dim/70">광고주가 캠페인을 집행하면 자동으로 반영됩니다</p>
                  </div>
                </td>
              </tr>
            ) : (
              settlements.map(s => {
                const isPastDeadline = s.posting_deadline && new Date(s.posting_deadline) < new Date();
                const isSettled = !!s.settled_date;
                return (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="py-3 px-3 text-xs text-dim">{formatDate(s.order_date || s.settled_date)}</td>
                    <td className="py-3 px-3 font-semibold">{s.client_name || '-'}</td>
                    <td className="py-3 px-3 text-right font-bold">{s.fee.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></td>
                    <td className="py-3 px-3 text-center">
                      {s.posting_deadline ? (
                        <span className={`text-xs font-semibold ${isPastDeadline ? 'text-down' : 'text-text'}`}>
                          {formatDate(s.posting_deadline)}
                        </span>
                      ) : (
                        <span className="text-xs text-dim">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {isSettled ? (
                        <span className="text-xs font-semibold text-up">{formatDate(s.settled_date)}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-gold/10 text-gold font-semibold">대기</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden">
        {settlements.length === 0 ? (
          <div className="text-center py-12 text-sm text-dim space-y-2">
            <svg className="mx-auto w-10 h-10 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
            <p>아직 정산내역이 없습니다</p>
            <p className="text-xs text-dim/70">광고주가 캠페인을 집행하면 자동으로 반영됩니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {settlements.map(s => {
              const isPastDeadline = s.posting_deadline && new Date(s.posting_deadline) < new Date();
              return (
                <div key={s.id} className="bg-bg rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{s.client_name || '-'}</span>
                    <span className="font-bold text-sm">{s.fee.toLocaleString()}원</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-dim">
                    <span>일자: {formatDate(s.order_date || s.settled_date)}</span>
                    {s.posting_deadline && (
                      <span className={isPastDeadline ? 'text-down' : ''}>
                        기한: {formatDate(s.posting_deadline)}
                      </span>
                    )}
                    {s.settled_date ? (
                      <span className="text-up font-semibold">
                        정산: {formatDate(s.settled_date)}
                      </span>
                    ) : (
                      <span className="text-gold font-semibold">대기</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
