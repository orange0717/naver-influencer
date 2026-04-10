'use client';

import { useState, useEffect } from 'react';

interface Settlement {
  id: string;
  settled_date: string;
  client_name: string;
  fee: number;
  commission: number;
  net_amount: number;
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

  // 합계
  const totalFee = settlements.reduce((sum, s) => sum + s.fee, 0);
  const totalCommission = settlements.reduce((sum, s) => sum + s.commission, 0);
  const totalNet = settlements.reduce((sum, s) => sum + s.net_amount, 0);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold">정산내역</h3>

      {/* 합계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg rounded-xl p-3 text-center">
          <p className="text-xs text-dim">총 원고료</p>
          <p className="text-lg font-black mt-1">{totalFee.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></p>
        </div>
        <div className="bg-bg rounded-xl p-3 text-center">
          <p className="text-xs text-dim">총 수수료</p>
          <p className="text-lg font-black mt-1">{totalCommission.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></p>
        </div>
        <div className="bg-bg rounded-xl p-3 text-center">
          <p className="text-xs text-dim">정산액</p>
          <p className="text-lg font-black mt-1 text-up">{totalNet.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></p>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <p className="text-xs text-dim text-center py-4">불러오는 중...</p>
      ) : settlements.length === 0 ? (
        <div className="text-center py-6 text-sm text-dim">
          <p>아직 정산내역이 없습니다</p>
          <p className="text-xs mt-1">광고주가 캠페인을 집행하면 자동으로 반영됩니다</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-dim">
                <th className="text-left py-2 font-medium">일자</th>
                <th className="text-left py-2 font-medium">거래처</th>
                <th className="text-right py-2 font-medium">원고료</th>
                <th className="text-right py-2 font-medium">수수료</th>
                <th className="text-right py-2 font-medium">정산액</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map(s => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-2.5 text-xs">{formatDate(s.settled_date)}</td>
                  <td className="py-2.5 font-medium">{s.client_name || '-'}</td>
                  <td className="py-2.5 text-right">{s.fee.toLocaleString()}원</td>
                  <td className="py-2.5 text-right text-dim">{s.commission.toLocaleString()}원</td>
                  <td className="py-2.5 text-right font-semibold text-up">{s.net_amount.toLocaleString()}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
