'use client';

import { useState, useEffect } from 'react';

interface Stats {
  todayVisits: number;       // 오늘 UV
  yesterdayVisits: number;
  totalVisits: number;
  todayPageviews: number;    // 오늘 PV
  yesterdayPageviews: number;
  totalPageviews: number;
  todaySignups: number;
  yesterdaySignups: number;
  totalSignups: number;
  devices?: { desktop: number; mobile: number; tablet: number };     // UV 기준 (세션)
  devicesPV?: { desktop: number; mobile: number; tablet: number };   // PV 기준
  periodLabel?: string;
  daily?: { date: string; count: number; pageviews: number }[];
}

interface TodayLog {
  id: string;
  visited_at: string;
  user_id: string | null;
  visitor_type: 'member' | 'demo' | 'anonymous';
  nickname: string | null;
  email: string | null;
  demo_naver_id: string | null;
  page_path: string;
  referrer_domain: string;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  device_type?: string | null;
  country?: string | null;
  browser: string;
  os: string;
  duration_seconds: number | null;
}

const TODAY_LOG_DEVICE_LABEL: Record<string, string> = {
  desktop: '데스크톱',
  mobile: '모바일',
  tablet: '태블릿',
};

/** 체류시간(초) → 한국어 라벨 (예: 45초, 2분 30초, 5분, 1시간 12분) */
function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-';
  if (seconds < 1) return '<1초';
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (seconds < 3600) return s === 0 ? `${m}분` : `${m}분 ${s}초`;
  const h = Math.floor(seconds / 3600);
  const remM = Math.floor((seconds % 3600) / 60);
  return remM === 0 ? `${h}시간` : `${h}시간 ${remM}분`;
}

interface TodayLogsData {
  total: number;
  uniqueVisitors: number;
  logs: TodayLog[];
}

interface ReferrerData {
  total: number;
  days: number;
  referrers: { domain: string; count: number }[];
  channels?: { category: string; label: string; total: number; items: { name: string; count: number }[] }[];
  utm_sources: { source: string; count: number }[];
  devices: { desktop: number; mobile: number; tablet: number };
  pages: { path: string; count: number }[];
  os_stats?: { name: string; count: number }[];
  browser_stats?: { name: string; count: number }[];
  device_os_stats?: { device: string; total: number; items: { name: string; count: number }[] }[];
  device_browser_stats?: { device: string; total: number; items: { name: string; count: number }[] }[];
}

const DEVICE_LABEL: Record<string, string> = {
  desktop: '데스크톱',
  mobile: '모바일',
  tablet: '태블릿',
};

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

function CrossTabList({ groups, colorMap }: { groups?: { device: string; total: number; items: { name: string; count: number }[] }[]; colorMap: Record<string, string> }) {
  const list = (groups || []).filter(g => g.total > 0);
  if (list.length === 0) return <p className="text-sm text-dim">데이터 없음</p>;
  return (
    <div className="space-y-4">
      {list.map(g => (
        <div key={g.device}>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-text font-bold">{DEVICE_LABEL[g.device] || g.device}</span>
            <span className="text-dim">총 {g.total}건</span>
          </div>
          <div className="space-y-1.5 pl-3 border-l-2 border-border">
            {g.items.map(it => {
              const pct = Math.round((it.count / g.total) * 100);
              const color = colorMap[it.name] || 'bg-accent';
              return (
                <div key={it.name}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="text-text">{it.name}</span>
                    <span className="text-dim">{it.count}건 ({pct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const [todayLogs, setTodayLogs] = useState<TodayLogsData | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/analytics/stats?days=${days}`, { credentials: 'include' }).then(r =>
        r.ok ? r.json() : Promise.reject(new Error(`stats ${r.status}`))
      ),
      fetch(`/api/analytics/referrers?days=${days}`, { credentials: 'include' }).then(r =>
        r.ok ? r.json() : Promise.reject(new Error(`referrers ${r.status}`))
      ),
    ]).then(([s, ref]) => {
      setStats(s);
      setReferrers(ref);
    }).catch(() => {
      setStats(null);
      setReferrers(null);
    }).finally(() => setLoading(false));
  }, [days]);

  // 오늘 방문 로그 (기간 변경과 무관, 항상 오늘)
  useEffect(() => {
    fetch('/api/admin/stats/today-logs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTodayLogs(d); })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const devicesUV = (referrers?.devices as { desktop?: number; mobile?: number; tablet?: number } | undefined) || {};
  const totalDevicesUV = (devicesUV.desktop || 0) + (devicesUV.mobile || 0) + (devicesUV.tablet || 0);
  const periodVisits = days === 1
    ? stats?.todayVisits || 0
    : days === 2
    ? stats?.yesterdayVisits || 0
    : (stats?.daily || []).reduce((sum, d) => sum + d.count, 0);
  const periodPageviews = days === 1
    ? stats?.todayPageviews || 0
    : days === 2
    ? stats?.yesterdayPageviews || 0
    : (stats?.daily || []).reduce((sum, d) => sum + (d.pageviews || 0), 0);
  const periodLabel = days === 1 ? '오늘' : days === 2 ? '어제' : `${days}일`;
  const logTotal = referrers?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">유입 분석</h1>
      </div>

      {/* 요약 카드: UV(순방문자), PV(페이지뷰), 가입 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {(() => {
          const periodSignups = days === 1
            ? stats?.todaySignups || 0
            : days === 2
            ? stats?.yesterdaySignups || 0
            : 0;
          return [
            { label: `${periodLabel} 순방문자(UV)`, sub: '1인 1일 1회', value: periodVisits, total: stats?.totalVisits || 0, accent: true },
            { label: `${periodLabel} 페이지뷰(PV)`, sub: '페이지 이동마다', value: periodPageviews, total: stats?.totalPageviews || 0, accent: true },
            { label: `${periodLabel} 가입`, sub: '신규 회원', value: periodSignups, total: stats?.totalSignups || 0, accent: true },
          ].map(item => (
            <div key={item.label} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-xs text-dim font-semibold">{item.label}</p>
                <p className="text-[10px] text-dim">{item.sub}</p>
              </div>
              <p className={`text-2xl font-extrabold font-rank ${item.accent ? 'text-accent' : 'text-text'}`}>
                {item.value.toLocaleString()}
              </p>
              <p className="text-[10px] text-dim mt-0.5">누적 {item.total.toLocaleString()}</p>
            </div>
          ));
        })()}
      </div>

      {/* 오늘 방문 로그 */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-extrabold">오늘 방문 로그</h2>
            <p className="text-[11px] text-dim mt-0.5">
              {todayLogs
                ? `${todayLogs.total.toLocaleString()}건 · 고유 방문자 ${todayLogs.uniqueVisitors}명 (로그인+익명)`
                : '불러오는 중...'}
            </p>
          </div>
          <button
            onClick={() => {
              setTodayLogs(null);
              fetch('/api/admin/stats/today-logs', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(d => d && setTodayLogs(d));
            }}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-border text-dim hover:text-accent hover:border-accent/40 cursor-pointer"
          >
            새로고침
          </button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {!todayLogs ? (
            <div className="py-8 text-center">
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
            </div>
          ) : todayLogs.logs.length === 0 ? (
            <p className="py-8 text-center text-dim text-sm">오늘 방문 기록이 없습니다.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-[10px] text-dim">
                  <th className="text-left py-2 px-2 font-semibold w-16">시간</th>
                  <th className="text-left py-2 px-2 font-semibold">사용자</th>
                  <th className="text-left py-2 px-2 font-semibold">페이지</th>
                  <th className="text-left py-2 px-2 font-semibold">유입 (Referer 원본·UTM은 마우스오버)</th>
                  <th className="text-left py-2 px-2 font-semibold w-16">기기</th>
                  <th className="text-left py-2 px-2 font-semibold w-14">국가</th>
                  <th className="text-left py-2 px-2 font-semibold w-20">체류</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {todayLogs.logs.map(log => {
                  const t = new Date(log.visited_at);
                  const timeLabel = t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={log.id} className="hover:bg-bg transition">
                      <td className="py-2 px-2 text-dim font-rank">{timeLabel}</td>
                      <td className="py-2 px-2">
                        {log.visitor_type === 'member' ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-white bg-accent px-1.5 py-0.5 rounded-full leading-none">회원</span>
                            <span className="font-semibold">{log.nickname || '(닉네임 없음)'}</span>
                          </span>
                        ) : log.visitor_type === 'demo' ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-white bg-emerald-500 px-1.5 py-0.5 rounded-full leading-none">데모</span>
                            <span className="font-semibold">{log.nickname || log.demo_naver_id || '(데모)'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-dim bg-bg px-1.5 py-0.5 rounded-full leading-none">익명</span>
                            <span className="text-dim">{log.browser} · {log.os}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] truncate max-w-xs">{log.page_path}</td>
                      <td
                        className="py-2 px-2 text-dim truncate max-w-[140px]"
                        title={[
                          log.referrer ? `Referer: ${log.referrer}` : '',
                          (log.utm_source || log.utm_medium || log.utm_campaign)
                            ? `UTM: ${[log.utm_source, log.utm_medium, log.utm_campaign].filter(Boolean).join(' / ')}`
                            : '',
                        ].filter(Boolean).join('\n')}
                      >
                        {log.referrer_domain}
                        {log.utm_source && (
                          <span className="ml-1 text-[9px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full leading-none">UTM</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-dim">{(log.device_type && TODAY_LOG_DEVICE_LABEL[log.device_type]) || log.device_type || '-'}</td>
                      <td className="py-2 px-2 text-dim">{log.country || '-'}</td>
                      <td className="py-2 px-2 text-dim font-rank tabular-nums">{formatDuration(log.duration_seconds)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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
        <span className="text-xs text-dim ml-2">UV {periodVisits.toLocaleString()} · PV {periodPageviews.toLocaleString()}</span>
      </div>

      {/* 일별 방문 추이 — UV/PV 같이 표시 */}
      {stats?.daily && stats.daily.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">일별 방문 추이</h2>
            <div className="flex items-center gap-3 text-[10px] text-dim">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-accent" /> UV
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-accent/30" /> PV
              </span>
            </div>
          </div>
          <div className="flex items-end gap-[2px] h-32">
            {(() => {
              const maxPV = Math.max(...stats.daily.map(d => Math.max(d.count, d.pageviews || 0)), 1);
              return stats.daily.map(d => (
                <div key={d.date} className="flex-1 group relative flex items-end justify-center gap-px h-full">
                  <div className="absolute -top-8 hidden group-hover:block text-[10px] text-dim whitespace-nowrap bg-surface border border-border rounded px-1.5 py-0.5 shadow-sm z-10">
                    {d.date.slice(5)} · UV {d.count} · PV {d.pageviews || 0}
                  </div>
                  <div
                    className="flex-1 bg-accent/30 rounded-t transition min-h-[2px]"
                    style={{ height: `${((d.pageviews || 0) / maxPV) * 100}%` }}
                  />
                  <div
                    className="flex-1 bg-accent/80 rounded-t hover:bg-accent transition min-h-[2px]"
                    style={{ height: `${(d.count / maxPV) * 100}%` }}
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

        {/* 채널 자동분류 (검색엔진/AI/SNS/외부/직접) */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">채널 자동분류</h2>
          <CrossTabList
            groups={referrers?.channels?.map(c => ({ device: c.label, total: c.total, items: c.items }))}
            colorMap={{}}
          />
        </div>

        {/* 기기 비율 (UV 기준) */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold">기기</h2>
            <span className="text-[10px] text-dim">{periodLabel} · UV 기준</span>
          </div>
          {totalDevicesUV > 0 ? (
            <div className="space-y-3">
              {[
                { label: '데스크톱', value: devicesUV.desktop || 0, color: 'bg-accent' },
                { label: '모바일', value: devicesUV.mobile || 0, color: 'bg-[#2DB400]' },
                { label: '태블릿', value: devicesUV.tablet || 0, color: 'bg-[#F29C68]' },
              ].map(d => (
                <div key={d.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text font-semibold">{d.label}</span>
                    <span className="text-dim">{d.value}건 ({totalDevicesUV > 0 ? Math.round((d.value / totalDevicesUV) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${d.color}`}
                      style={{ width: `${totalDevicesUV > 0 ? (d.value / totalDevicesUV) * 100 : 0}%` }}
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

        {/* 기기 × OS */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">기기 × OS</h2>
          <CrossTabList groups={referrers?.device_os_stats} colorMap={OS_COLORS} />
        </div>

        {/* 기기 × 브라우저 */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-bold mb-3">기기 × 브라우저</h2>
          <CrossTabList groups={referrers?.device_browser_stats} colorMap={BROWSER_COLORS} />
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
