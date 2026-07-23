'use client';

import { useEffect, useState } from 'react';

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

interface Failure {
  id: string;
  user_id: string;
  blog_id: string;
  url: string;
  title: string | null;
  status: string;
  failure_reason_code: string | null;
  error_message: string | null;
  updated_at: string;
}

interface PerUserUsage {
  userId: string;
  email: string | null;
  blogId: string | null;
  count: number;
}

interface Data {
  recentJobs: Job[];
  statusCounts: Record<string, number>;
  totalRegistered: number;
  apiCallsLast20Jobs: number;
  failures: Failure[];
  perUserUsage: PerUserUsage[];
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <p className="text-xs text-dim font-semibold mb-1">{label}</p>
      <p className="text-2xl font-extrabold font-rank text-text">{value}</p>
    </div>
  );
}

export default function AdminGoogleIndexingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/google-indexing', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch('/api/admin/google-indexing/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) load();
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">구글 색인등록 현황</h1>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm font-semibold text-accent border border-accent/40 hover:bg-accent/10 px-3 py-1.5 rounded-lg"
        >
          {loading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="전체 등록(최근)" value={data.totalRegistered.toLocaleString()} />
            <StatCard label="색인완료" value={(data.statusCounts.indexed ?? 0).toLocaleString()} />
            <StatCard label="확인중" value={((data.statusCounts.submitted ?? 0) + (data.statusCounts.checking ?? 0)).toLocaleString()} />
            <StatCard label="미색인" value={(data.statusCounts.not_indexed ?? 0).toLocaleString()} />
            <StatCard label="최근 20회 폴링 API 호출" value={data.apiCallsLast20Jobs.toLocaleString()} />
          </div>

          <section>
            <h2 className="text-base font-bold mb-3">최근 폴링 크론 실행 로그</h2>
            <div className="bg-surface border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-surface-hover text-xs text-dim">
                  <tr>
                    <th className="text-left px-4 py-2">상태</th>
                    <th className="text-left px-4 py-2">시작</th>
                    <th className="text-right px-4 py-2">대상</th>
                    <th className="text-right px-4 py-2">처리</th>
                    <th className="text-right px-4 py-2">실패</th>
                    <th className="text-left px-4 py-2">에러</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.map((j) => (
                    <tr key={j.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            j.status === 'success' ? 'bg-up/15 text-up' : j.status === 'failed' ? 'bg-down/15 text-down' : 'bg-accent/15 text-accent'
                          }`}
                        >
                          {j.status}
                        </span>
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
                  {data.recentJobs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-dim">데이터 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">실패 로그 (미색인 · 오류)</h2>
            <div className="bg-surface border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-surface-hover text-xs text-dim">
                  <tr>
                    <th className="text-left px-4 py-2">URL</th>
                    <th className="text-left px-4 py-2">상태</th>
                    <th className="text-left px-4 py-2">원인</th>
                    <th className="text-left px-4 py-2">업데이트</th>
                    <th className="text-right px-4 py-2">재시도</th>
                  </tr>
                </thead>
                <tbody>
                  {data.failures.map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="px-4 py-2 max-w-xs truncate">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {f.title || f.url}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-dim">{f.status}</td>
                      <td className="px-4 py-2 text-dim text-xs">{f.failure_reason_code || f.error_message || '-'}</td>
                      <td className="px-4 py-2 text-dim text-xs">{formatRelative(f.updated_at)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleRetry(f.id)}
                          disabled={retryingId === f.id}
                          className="text-xs font-semibold text-accent hover:underline disabled:opacity-50"
                        >
                          {retryingId === f.id ? '재시도중...' : '재시도'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.failures.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-dim">실패 건이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">사용자별 사용량 TOP 20</h2>
            <div className="bg-surface border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-surface-hover text-xs text-dim">
                  <tr>
                    <th className="text-left px-4 py-2">이메일</th>
                    <th className="text-left px-4 py-2">블로그 아이디</th>
                    <th className="text-right px-4 py-2">등록 건수</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perUserUsage.map((u) => (
                    <tr key={u.userId} className="border-t border-border">
                      <td className="px-4 py-2">{u.email || '-'}</td>
                      <td className="px-4 py-2 text-dim">{u.blogId || '-'}</td>
                      <td className="px-4 py-2 text-right">{u.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.perUserUsage.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-dim">데이터 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
