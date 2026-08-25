'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CARD_BASE_CLASS } from '@/components/dashboard/card-base';

interface DashboardData {
  totalUsers: number;
  todaySignups: number;
  monthSignups: number;
  subscribers: number;
  totalRevenue: number;
  pendingReports: number;
  totalReports: number;
  dailySignups: { date: string; count: number }[];
  recentUsers: { nickname: string; email: string; created_at: string }[];
  recentReports: { id: string; reason: string; status: string; created_at: string }[];
  recentMatchLogs: {
    id: string;
    match_method: string;
    created_at: string;
    matched_user: { id: string; nickname: string } | null;
  }[];
  newEnterpriseInquiries: number;
  totalEnterpriseInquiries: number;
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

  const cards: { label: string; value: string; sub: string; href?: string }[] = [
    { label: '총 회원', value: data.totalUsers.toLocaleString(), sub: `오늘 ${data.todaySignups}명` },
    { label: '이번 달 가입', value: data.monthSignups.toLocaleString(), sub: `오늘 ${data.todaySignups}명` },
    { label: '유료 구독', value: data.subscribers.toLocaleString(), sub: `월 ${data.totalRevenue.toLocaleString()}원` },
    { label: '신고 대기', value: data.pendingReports.toLocaleString(), sub: `전체 ${data.totalReports}건` },
    {
      label: '신규 기업문의',
      value: (data.newEnterpriseInquiries ?? 0).toLocaleString(),
      sub: `전체 ${data.totalEnterpriseInquiries ?? 0}건`,
      href: '/admin/enterprise',
    },
  ];

  const maxCount = Math.max(...data.dailySignups.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="type-page-title">대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(card => {
          const body = (
            <>
              <p className="stat-title mb-2">{card.label}</p>
              <p className="stat-value stat-value-kpi text-accent">{card.value}</p>
              <p className="stat-desc mt-1">{card.sub}</p>
            </>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} className={`${CARD_BASE_CLASS} p-4 hover:border-accent/40 transition`}>
              {body}
            </Link>
          ) : (
            <div key={card.label} className={`${CARD_BASE_CLASS} p-4`}>{body}</div>
          );
        })}
      </div>

      {/* 최근 가입 회원 */}
      <div className="bg-surface rounded-lg border border-border">
        <h2 className="text-sm font-bold p-5 pb-3">최근 가입 회원</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-border text-xs text-dim">
              <th className="text-left px-5 py-2.5 font-semibold">이름</th>
              <th className="text-left px-5 py-2.5 font-semibold">이메일</th>
              <th className="text-right px-5 py-2.5 font-semibold">가입일</th>
            </tr>
          </thead>
          <tbody>
            {data.recentUsers.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-8 text-dim text-xs">가입 회원이 없습니다.</td>
              </tr>
            ) : (
              data.recentUsers.map((user, i) => (
                <tr key={i} className="border-t border-border hover:bg-surface-hover transition">
                  <td className="px-5 py-3 font-medium">{user.nickname || '-'}</td>
                  <td className="px-5 py-3 text-dim">{user.email || '-'}</td>
                  <td className="px-5 py-3 text-dim text-right">{new Date(user.created_at).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 최근 신고 */}
      <div className="bg-surface rounded-lg border border-border">
        <h2 className="text-sm font-bold p-5 pb-3">최근 신고</h2>
        {data.recentReports.length === 0 ? (
          <div className="text-center py-8 text-dim text-xs border-t border-border">신고가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border text-xs text-dim">
                <th className="text-left px-5 py-2.5 font-semibold">사유</th>
                <th className="text-right px-5 py-2.5 font-semibold">일시</th>
              </tr>
            </thead>
            <tbody>
              {data.recentReports.map(report => (
                <tr key={report.id} className="border-t border-border hover:bg-surface-hover transition">
                  <td className="px-5 py-3 font-medium">{report.reason || '-'}</td>
                  <td className="px-5 py-3 text-dim text-right">{new Date(report.created_at).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Google 자동매칭 로그 */}
      <div className="bg-surface rounded-lg border border-border">
        <h2 className="text-sm font-bold p-5 pb-3">Google 자동매칭 로그</h2>
        {data.recentMatchLogs.length === 0 ? (
          <div className="text-center py-8 text-dim text-xs border-t border-border">매칭 기록이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border text-xs text-dim">
                <th className="text-left px-5 py-2.5 font-semibold">회원</th>
                <th className="text-left px-5 py-2.5 font-semibold">매칭 방식</th>
                <th className="text-right px-5 py-2.5 font-semibold">시간</th>
              </tr>
            </thead>
            <tbody>
              {data.recentMatchLogs.map(log => (
                <tr key={log.id} className="border-t border-border hover:bg-surface-hover transition">
                  <td className="px-5 py-3 font-medium">{log.matched_user?.nickname || log.matched_user?.id || '-'}</td>
                  <td className="px-5 py-3 text-dim">{log.match_method === 'blog_id' ? '블로그 주소' : '닉네임'}</td>
                  <td className="px-5 py-3 text-dim text-right">{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 30일 가입 추이 */}
      <div className="bg-surface rounded-lg border border-border p-5">
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
