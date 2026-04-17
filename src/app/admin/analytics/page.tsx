'use client';

import { useState, useEffect } from 'react';

interface Stats {
  todayVisits: number;
  yesterdayVisits: number;
  totalVisits: number;
  todaySignups: number;
  yesterdaySignups: number;
  totalSignups: number;
  devices?: { desktop: number; mobile: number; tablet: number };
  daily?: { date: string; count: number }[];
}

interface ReferrerData {
  total: number;
  days: number;
  referrers: { domain: string; count: number }[];
  utm_sources: { source: string; count: number }[];
  devices: { desktop: number; mobile: number; tablet: number };
  pages: { path: string; count: number }[];
  os_stats?: { name: string; count: number }[];
  browser_stats?: { name: string; count: number }[];
}

const OS_COLORS: Record<string, string> = {
  'Windows': 'bg-[#0078D4]',
  'macOS': 'bg-[#999999]',
  'iOS': 'bg-[#333333]',
  'Android': 'bg-[#3DDC84]',
  'Linux': 'bg-[#FCC624]',
  'ChromeOS': 'bg-[#4285F4]',
  '기타': 'bg-[#C4B8B3]',
};

const BROWSER_COLORS: Record<string, string> = {
  'Chrome': 'bg-[#4285F4]',
  'Safari': 'bg-[#0FB5EE]',
  'Edge': 'bg-[#0078D7]',
  'Firefox': 'bg-[#FF7139]',
  'Opera': 'bg-[#FF1B2D]',
  'Whale': 'bg-[#03C75A]',
  'Samsung Internet': 'bg-[#1428A0]',
  '기타': 'bg-[#C4B8B3]',
};

function BarList({ items, colorMap }: { items?: { name: string; count: number }[]; colorMap: Record<string, string> }) {
  const list = items || [];
  const sum = list.reduce((s, x) => s + x.count, 0);
  if (sum === 0) return <p className="text-sm text-dim">데이터 없음</p>;
  return (
    <div className="space-y-3">
      {list.map(d => {
        const pct = Math.round((d.count / sum) * 100);
        const color = colorMap[d.name] || 'bg-accent';
        return (
          <div key={d.name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-text font-semibold">{d.name}</span>
              <span className="text-dim">{d.count}건 ({pct}%)</span>
            </div>
            <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [referrers, setReferrers] = useState<ReferrerData | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/analytics/stats?days=${days}`).then(r => r.json()),
      fetch(`/api/analytics/referrers?days=${days}`).then(r => r.json()),
    ]).then(([s, ref]) => {
      setStats(s);
      setReferrers(ref);
    }).finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const totalDevices = (stats?.devices?.desktop || 0) + (stats?.devices?.mobile || 0) + (stats?.devices?.tablet || 0);
  const periodVisits = days === 1
    ? stats?.todayVisits || 0
    : days === 2
    ? stats?.yesterdayVisits || 0
    : (stats?.daily || []).reduce((sum, d) => sum + d.count, 0);
  const periodLabel = days === 1 ? '오늘' : days === 2 ? '어제' : `${days}일`;
  const logTotal = referrers?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">유입 분석</h1>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(() => {
          const periodSignups = days === 1
            ? stats?.todaySignups || 0
            : days === 2
            ? stats?.yesterdaySignups || 0
            : 0;
          return [
            { label: `${periodLabel} 방문`, value: periodVisits, accent: true },
            { label: '총 방문', value: stats?.totalVisits || 0 },
            { label: `${periodLabel} 가입`, value: periodSignups, accent: true },
            { label: '총 가입', value: stats?.totalSignups || 0 },
          ].map(item => (
            <div key={item.label} className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-dim mb-1">{item.label}</p>
              <p className={`text-2xl font-extrabold font-rank ${item.accent ? 'text-accent' : 'text-text'}`}>
                {item.value.toLocaleString()}
              </p>
            </div>
          ));
        })()}
      </div>

      {/* 기간 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-dim font-semibold">기간</span>
        {[
          { value: 1, label: '오늘' },
          { value: 2, label: '어제' },
          { value: 7, label: '7일' },
          { value: 14, label: '14일' },
          { value: 30, label: '30일' },
          { value: 90, label: '90일' },
        ].map(d => (
          <button
            key={d.value}
            onClick={() => { setLoading(true); setDays(d.value); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              days === d.value
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surface border border-border/50 text-dim hover:border-accent/30'
            }`}
          >
            {d.label}
          </button>
        ))}
        <span className="text-xs text-dim ml-2">총 {periodVisits}건</span>
      </div>

      {/* 일별 방문 추이 */}
      {stats?.daily && stats.daily.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">일별 방문 추이</h2>
          <div className="flex items-end gap-[2px] h-32">
            {(() => {
              const maxCount = Math.max(...stats.daily.map(d => d.count), 1);
              return stats.daily.map(d => (
                <div key={d.date} className="flex-1 group relative flex flex-col items-center justify-end h-full">
                  <div className="absolute -top-5 hidden group-hover:block text-[10px] text-dim whitespace-nowrap bg-surface border border-border rounded px-1.5 py-0.5 shadow-sm z-10">
                    {d.date.slice(5)} · {d.count}명
                  </div>
                  <div
                    className="w-full bg-accent/70 rounded-t hover:bg-accent transition min-h-[2px]"
                    style={{ height: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
              ));
            })()}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-dim">{stats.daily[0]?.date.slice(5)}</span>
            <span className="text-[10px] text-dim">{stats.daily[stats.daily.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* 유입 경로 */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">유입 경로</h2>
          {referrers?.referrers.length ? (
            <div className="space-y-2">
              {referrers.referrers.map(r => {
                const scaled = logTotal > 0 ? Math.round((r.count / logTotal) * periodVisits) : 0;
                return (
                  <div key={r.domain} className="flex items-center justify-between">
                    <span className="text-sm text-text truncate flex-1">{r.domain}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 bg-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${Math.min(100, (r.count / (logTotal || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-dim font-rank w-8 text-right">{scaled}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-dim">데이터 없음</p>
          )}
        </div>

        {/* 기기 비율 */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">기기</h2>
          {totalDevices > 0 ? (
            <div className="space-y-3">
              {[
                { label: '데스크톱', value: stats?.devices?.desktop || 0, color: 'bg-accent' },
                { label: '모바일', value: stats?.devices?.mobile || 0, color: 'bg-[#2DB400]' },
                { label: '태블릿', value: stats?.devices?.tablet || 0, color: 'bg-[#F29C68]' },
              ].map(d => (
                <div key={d.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text font-semibold">{d.label}</span>
                    <span className="text-dim">{d.value}건 ({totalDevices > 0 ? Math.round((d.value / totalDevices) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${d.color}`}
                      style={{ width: `${totalDevices > 0 ? (d.value / totalDevices) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-dim">데이터 없음</p>
          )}
        </div>

        {/* OS */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">OS</h2>
          <BarList items={referrers?.os_stats} colorMap={OS_COLORS} />
        </div>

        {/* 브라우저 */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">브라우저</h2>
          <BarList items={referrers?.browser_stats} colorMap={BROWSER_COLORS} />
        </div>

        {/* 인기 페이지 */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">인기 페이지</h2>
          {referrers?.pages.length ? (
            <div className="space-y-2">
              {referrers.pages.map(p => {
                const scaled = logTotal > 0 ? Math.round((p.count / logTotal) * periodVisits) : 0;
                return (
                  <div key={p.path} className="flex items-center justify-between">
                    <span className="text-sm text-text truncate flex-1 font-mono">{p.path}</span>
                    <span className="text-xs text-dim font-rank shrink-0 ml-2">{scaled}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-dim">데이터 없음</p>
          )}
        </div>

        {/* UTM 캠페인 */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">UTM 캠페인</h2>
          {referrers?.utm_sources.length ? (
            <div className="space-y-2">
              {referrers.utm_sources.map(u => (
                <div key={u.source} className="flex items-center justify-between">
                  <span className="text-sm text-text truncate flex-1">{u.source}</span>
                  <span className="text-xs text-dim font-rank shrink-0 ml-2">{u.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-dim">아직 UTM 데이터가 없습니다</p>
          )}
          <p className="text-[10px] text-dim mt-3">
            ?utm_source=naver&utm_medium=blog&utm_campaign=launch 형태로 링크 공유 시 추적됩니다
          </p>
        </div>
      </div>
    </div>
  );
}
