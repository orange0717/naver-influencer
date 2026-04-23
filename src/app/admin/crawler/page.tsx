'use client';

import { useEffect, useState } from 'react';

interface Summary {
  total_active: number;
  fresh_within_1h: number;
  fresh_within_24h: number;
  stale_over_24h: number;
  never_crawled: number;
  coverage_24h_pct: number;
  coverage_1h_pct: number;
}

interface Oldest {
  naver_id: string;
  display_name: string;
  last_crawled_at: string;
}

interface Job {
  id: string;
  job_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_items: number | null;
  processed_items: number | null;
  failed_items: number | null;
  error_message: string | null;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '-';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return '방금 전';
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function AdminCrawlerPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [oldest, setOldest] = useState<Oldest[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/crawler-stats', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data.summary);
      setOldest(data.oldest);
      setJobs(data.recent_jobs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">크롤러 상태</h1>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm font-semibold text-accent border border-accent/40 hover:bg-accent/10 px-3 py-1.5 rounded-lg"
        >
          {loading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="활성 인플루언서" value={summary.total_active.toLocaleString()} />
            <StatCard label="1시간 내 크롤" value={summary.fresh_within_1h.toLocaleString()} sub={`${summary.coverage_1h_pct}%`} />
            <StatCard
              label="24시간 내 크롤"
              value={summary.fresh_within_24h.toLocaleString()}
              sub={`${summary.coverage_24h_pct}%`}
              tone={summary.coverage_24h_pct >= 95 ? 'up' : summary.coverage_24h_pct >= 80 ? 'neutral' : 'down'}
            />
            <StatCard
              label="24시간 초과 누락"
              value={summary.stale_over_24h.toLocaleString()}
              sub={summary.never_crawled > 0 ? `(한 번도 크롤 안 된 ${summary.never_crawled}명 포함)` : undefined}
              tone={summary.stale_over_24h === 0 ? 'up' : summary.stale_over_24h < 100 ? 'neutral' : 'down'}
            />
          </div>

          {summary.stale_over_24h > 0 && (
            <div className="bg-down/10 border border-down/30 text-down rounded-lg px-4 py-3 text-sm font-semibold">
              경고: {summary.stale_over_24h.toLocaleString()}명이 24시간 이상 크롤되지 않았습니다. 크론 스케줄 또는 인증 상태를 점검하세요.
            </div>
          )}
        </>
      )}

      <section>
        <h2 className="text-base font-bold mb-3">가장 오래 크롤되지 않은 인플루언서 TOP 5</h2>
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover text-xs text-dim">
              <tr>
                <th className="text-left px-4 py-2">인플루언서</th>
                <th className="text-left px-4 py-2">naver_id</th>
                <th className="text-right px-4 py-2">마지막 크롤</th>
              </tr>
            </thead>
            <tbody>
              {oldest.map(o => (
                <tr key={o.naver_id} className="border-t border-border">
                  <td className="px-4 py-2">{o.display_name}</td>
                  <td className="px-4 py-2 text-dim">@{o.naver_id}</td>
                  <td className="px-4 py-2 text-right">{formatRelative(o.last_crawled_at)}</td>
                </tr>
              ))}
              {oldest.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-dim">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold mb-3">최근 크롤 Job 20건</h2>
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-surface-hover text-xs text-dim">
              <tr>
                <th className="text-left px-4 py-2">Job</th>
                <th className="text-left px-4 py-2">상태</th>
                <th className="text-left px-4 py-2">시작</th>
                <th className="text-right px-4 py-2">대상</th>
                <th className="text-right px-4 py-2">처리</th>
                <th className="text-right px-4 py-2">실패</th>
                <th className="text-left px-4 py-2">에러</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold">{j.job_type}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      j.status === 'success' ? 'bg-up/15 text-up'
                      : j.status === 'failed' ? 'bg-down/15 text-down'
                      : 'bg-accent/15 text-accent'
                    }`}>{j.status}</span>
                  </td>
                  <td className="px-4 py-2 text-dim">{formatRelative(j.started_at)}</td>
                  <td className="px-4 py-2 text-right">{j.total_items ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{j.processed_items ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{j.failed_items ?? '-'}</td>
                  <td className="px-4 py-2 text-xs text-dim truncate max-w-[240px]" title={j.error_message || ''}>
                    {j.error_message || '-'}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-dim">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' | 'neutral' }) {
  const toneClass = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text';
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <p className="text-xs text-dim font-semibold mb-1">{label}</p>
      <p className={`text-2xl font-extrabold font-rank ${toneClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-dim mt-0.5">{sub}</p>}
    </div>
  );
}
