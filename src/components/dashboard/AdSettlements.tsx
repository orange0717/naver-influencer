'use client';

import { useState, useEffect } from 'react';

interface Settlement {
  id: string;
  year_month: string;
  count: number;
  amount: number;
  memo: string;
}

export default function AdSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my/ad-settlements')
      .then(res => res.json())
      .then(data => setSettlements(data.settlements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 연간 합계
  const currentYear = new Date().getFullYear().toString();
  const yearSettlements = settlements.filter(s => s.year_month.startsWith(currentYear));
  const totalAmount = yearSettlements.reduce((sum, s) => sum + s.amount, 0);
  const totalCount = yearSettlements.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">원고료 정산내역</h3>
        <span className="text-xs text-dim">광고주 집행 시 자동 반영</span>
      </div>

      {/* 연간 요약 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg rounded-xl p-3 text-center">
          <p className="text-xs text-dim">{currentYear}년 총 건수</p>
          <p className="text-xl font-black mt-1">{totalCount}<span className="text-xs text-dim font-normal ml-0.5">건</span></p>
        </div>
        <div className="bg-bg rounded-xl p-3 text-center">
          <p className="text-xs text-dim">{currentYear}년 총 금액</p>
          <p className="text-xl font-black mt-1">{totalAmount.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></p>
        </div>
      </div>

      {/* 월별 테이블 */}
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
                <th className="text-left py-2 font-medium">월</th>
                <th className="text-right py-2 font-medium">건수</th>
                <th className="text-right py-2 font-medium">금액</th>
                <th className="text-left py-2 pl-3 font-medium">메모</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map(s => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-2.5 font-medium">{formatMonth(s.year_month)}</td>
                  <td className="py-2.5 text-right">{s.count}건</td>
                  <td className="py-2.5 text-right font-semibold">{s.amount.toLocaleString()}원</td>
                  <td className="py-2.5 pl-3 text-dim text-xs truncate max-w-[150px]">{s.memo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `${year}.${month}`;
}
