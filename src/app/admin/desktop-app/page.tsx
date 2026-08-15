'use client';

import { useEffect, useState } from 'react';

interface StatsPayload {
  ok: boolean;
  needsMigration?: boolean;
  days: number;
  since: string;
  totals: {
    download_page_view: number;
    asset_download_click: number;
    app_launch: number;
  };
  uniqueClients: {
    asset_download_click: number;
    app_launch: number;
  };
  byDetail: { detail: string; count: number }[];
  daily: {
    date: string;
    download_page_view: number;
    asset_download_click: number;
    app_launch: number;
  }[];
  recent: {
    id: string;
    created_at: string;
    event_type: string;
    detail: string | null;
    app_version: string | null;
    client_id: string | null;
    user_id: string | null;
  }[];
  error?: string;
}

const EVENT_LABEL: Record<string, string> = {
  download_page_view: '다운로드 페이지 방문',
  asset_download_click: '설치 파일 클릭',
  app_launch: '앱 실행',
};

export default function AdminDesktopAppPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/desktop-app-stats?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-extrabold">데스크탑 앱</h1>
        <p className="text-sm text-dim">{data?.error || '데이터를 불러올 수 없습니다.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">데스크탑 앱</h1>
          <p className="text-sm text-dim mt-1">
            다운로드 페이지 방문, 설치 파일 링크 클릭, 데스크탑 앱 실행(비식별) 집계입니다.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-text">
          기간
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="border border-border rounded-lg px-3 py-2 bg-surface text-text"
          >
            <option value={7}>최근 7일</option>
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        </label>
      </div>

      {data.needsMigration && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-text">
          Supabase에 <code className="text-xs bg-bg px-1 rounded">migration-094-desktop-app-events.sql</code>을
          적용하면 집계가 시작됩니다. 적용 전에는 이벤트가 저장되지 않습니다.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-xs text-dim mb-2">다운로드 페이지 방문</p>
          <p className="text-3xl font-extrabold text-text">{data.totals.download_page_view.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-xs text-dim mb-2">설치 파일 클릭</p>
          <p className="text-3xl font-extrabold text-text">{data.totals.asset_download_click.toLocaleString()}</p>
          <p className="text-xs text-dim mt-2">
            대략적 기기 수(클라이언트 ID 기준): {data.uniqueClients.asset_download_click.toLocaleString()}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-xs text-dim mb-2">앱 실행 ping</p>
          <p className="text-3xl font-extrabold text-text">{data.totals.app_launch.toLocaleString()}</p>
          <p className="text-xs text-dim mt-2">
            클라이언트 ID 기준(있을 때만): {data.uniqueClients.app_launch.toLocaleString()}
          </p>
        </div>
      </div>

      {data.byDetail.length > 0 && (
        <div>
          <h2 className="text-sm font-extrabold text-text mb-3">클릭·실행 상세 코드</h2>
          <div className="bg-surface rounded-xl border border-border divide-y divide-border max-h-72 overflow-y-auto">
            {data.byDetail.map(row => (
              <div key={row.detail} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <code className="text-xs text-accent font-semibold truncate pr-2">{row.detail}</code>
                <span className="text-dim shrink-0">{row.count.toLocaleString()}건</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.daily.length > 0 && (
        <div>
          <h2 className="text-sm font-extrabold text-text mb-3">일별 (KST)</h2>
          <div className="space-y-2">
            {data.daily.map(d => {
              const sum = d.download_page_view + d.asset_download_click + d.app_launch;
              const pv = d.download_page_view;
              const ck = d.asset_download_click;
              const ap = d.app_launch;
              return (
                <div key={d.date} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 font-mono text-dim">{d.date}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex h-2 rounded-full overflow-hidden w-full bg-bg">
                      {sum > 0 ? (
                        <>
                          {pv > 0 && (
                            <div
                              className="h-full bg-accent/50"
                              style={{ flex: pv }}
                              title={`페이지 방문 ${pv}`}
                            />
                          )}
                          {ck > 0 && (
                            <div className="h-full bg-accent" style={{ flex: ck }} title={`파일 클릭 ${ck}`} />
                          )}
                          {ap > 0 && (
                            <div className="h-full bg-text/35" style={{ flex: ap }} title={`앱 실행 ${ap}`} />
                          )}
                        </>
                      ) : (
                        <div className="h-full flex-1 bg-border" />
                      )}
                    </div>
                  </div>
                  <span className="w-20 text-right text-dim shrink-0 tabular-nums">
                    {pv}/{ck}/{ap}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-dim mt-2">
            막대 비율은 해당 일의 세 지표 합계 기준이며, 오른쪽 숫자는 페이지/클릭/앱 실행 건수입니다.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-extrabold text-text mb-3">최근 이벤트 (최대 200건)</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-bg text-dim text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">시각 (UTC)</th>
                <th className="px-3 py-2 font-semibold">유형</th>
                <th className="px-3 py-2 font-semibold">상세</th>
                <th className="px-3 py-2 font-semibold">앱 버전</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-dim">
                    기록이 없습니다.
                  </td>
                </tr>
              ) : (
                data.recent.map(r => (
                  <tr key={r.id} className="hover:bg-bg/80">
                    <td className="px-3 py-2 font-mono text-dim whitespace-nowrap">{r.created_at.slice(0, 19)}</td>
                    <td className="px-3 py-2">{EVENT_LABEL[r.event_type] || r.event_type}</td>
                    <td className="px-3 py-2">
                      <code className="text-[11px]">{r.detail || '—'}</code>
                    </td>
                    <td className="px-3 py-2">{r.app_version || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
