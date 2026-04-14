'use client';

import { useState, useEffect } from 'react';

interface DashboardData {
  totalUsers: number;
  todaySignups: number;
  subscribers: number;
  totalRevenue: number;
  activeDemos: number;
  pendingReports: number;
  dailySignups: { date: string; count: number }[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!data) return <div className="py-20 text-center text-dim">데이터를 불러올 수 없습니다.</div>;

  const cards = [
    { label: '총 회원', value: data.totalUsers.toLocaleString(), accent: false },
    { label: '오늘 가입', value: data.todaySignups.toLocaleString(), accent: true },
    { label: '유료 구독', value: `${data.subscribers}명`, accent: true },
    { label: '총 매출', value: `${data.totalRevenue.toLocaleString()}원`, accent: false },
    { label: '활성 데모', value: data.activeDemos.toLocaleString(), accent: false },
    { label: '신고 대기', value: data.pendingReports.toLocaleString(), accent: data.pendingReports > 0 },
  ];

  const maxCount = Math.max(...data.dailySignups.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-surface rounded-xl border border-border p-4 text-center">
            <p className="text-xs text-dim mb-1">{card.label}</p>
            <p className={`text-2xl font-extrabold font-rank ${card.accent ? 'text-accent' : 'text-text'}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* 일별 가입 추이 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-sm font-bold mb-3">최근 30일 가입 추이</h2>
        <div className="flex items-end gap-[2px] h-32">
          {data.dailySignups.map(d => (
            <div key={d.date} className="flex-1 group relative flex flex-col items-center justify-end h-full">
              <div className="absolute -top-5 hidden group-hover:block text-[10px] text-dim whitespace-nowrap bg-surface border border-border rounded px-1.5 py-0.5 shadow-sm z-10">
                {d.date.slice(5)} · {d.count}명
              </div>
              <div
                className="w-full bg-accent/70 rounded-t hover:bg-accent transition min-h-[2px]"
                style={{ height: `${(d.count / maxCount) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-dim">{data.dailySignups[0]?.date.slice(5)}</span>
          <span className="text-[10px] text-dim">{data.dailySignups[data.dailySignups.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </div>
  );
}
