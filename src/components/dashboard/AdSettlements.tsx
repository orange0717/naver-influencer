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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">정산내역</h3>
        {settlements.length > 0 && (
          <div className="text-sm text-dim">
            총 원고료: <strong className="text-text">{totalFee.toLocaleString()}원</strong>
            <span className="mx-1.5 text-border">|</span>
            {settlements.length}건
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-dim text-center py-4">불러오는 중...</p>
      ) : settlements.length === 0 ? (
        <div className="text-center py-6 text-sm text-dim">
          <p>아직 정산내역이 없습니다</p>
          <p className="text-xs mt-1">광고주가 캠페인을 집행하면 자동으로 반영됩니다</p>
        </div>
      ) : (
        <>
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
                {settlements.map(s => {
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
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-2">
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
                    <span className="text-up font-semibold">
                      정산: {formatDate(s.settled_date)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
