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
  error_code: string | null;
  http_status: number | null;
  retryable: boolean | null;
  error_message: string | null;
  updated_at: string;
}

interface PerUserUsage {
  userId: string;
  email: string | null;
  blogId: string | null;
  count: number;
}

interface OauthDiagnostic {
  userId: string;
  email: string | null;
  blogId: string | null;
  googleEmail: string | null;
  siteUrl: string | null;
  siteVerified: boolean;
  updatedAt: string;
  liveSites: { siteUrl: string; permissionLevel: string }[] | null;
  liveSitesError: string | null;
}

interface Data {
  recentJobs: Job[];
  statusCounts: Record<string, number>;
  totalRegistered: number;
  apiCallsLast20Jobs: number;
  failures: Failure[];
  perUserUsage: PerUserUsage[];
  oauthDiagnostics: OauthDiagnostic[];
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
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

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

  async function handleAssignSite(userId: string, siteUrl: string) {
    const key = `${userId}:${siteUrl}`;
    setAssigningKey(key);
    try {
      const res = await fetch('/api/admin/google-indexing/site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, siteUrl }),
      });
      if (res.ok) {
        load();
      } else {
        const err = await res.json();
        alert(err.error || '속성 지정에 실패했습니다.');
      }
    } finally {
      setAssigningKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="type-page-title">구글 색인등록 현황</h1>
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
                    <th className="text-left px-4 py-2">오류코드</th>
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
                      <td className="px-4 py-2 text-xs">
                        {f.error_code && (
                          <span className={`font-bold px-1.5 py-0.5 rounded ${f.retryable ? 'bg-accent/15 text-accent' : 'bg-down/15 text-down'}`}>
                            {f.error_code}{f.http_status ? ` (${f.http_status})` : ''}
                          </span>
                        )}
                        {f.error_code && (
                          <span className="ml-1 text-dim">{f.retryable ? '재시도가능' : '조치필요'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-dim text-xs max-w-xs truncate" title={f.error_message || ''}>{f.failure_reason_code || f.error_message || '-'}</td>
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
                      <td colSpan={6} className="px-4 py-6 text-center text-dim">실패 건이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Google 계정 연결 · GSC 속성 진단</h2>
            <p className="text-xs text-dim mb-3">
              site_verified가 false인 계정은 지금 이 순간 실제 Google API(listSites)를 호출해 그 계정에 보이는 GSC 속성 목록을 그대로 보여줍니다.
              목록이 비어 있으면 해당 Google 계정이 blog.naver.com/블로그ID/ 속성의 소유권을 GSC에서 아직 확인하지 않은 것이고,
              liveSitesError가 있으면 API 호출 자체가 실패한 것입니다.
            </p>
            <div className="bg-surface border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-surface-hover text-xs text-dim">
                  <tr>
                    <th className="text-left px-4 py-2">이메일 / 블로그</th>
                    <th className="text-left px-4 py-2">Google 계정</th>
                    <th className="text-left px-4 py-2">저장된 site_url</th>
                    <th className="text-left px-4 py-2">실시간 GSC 속성 목록</th>
                  </tr>
                </thead>
                <tbody>
                  {data.oauthDiagnostics.map((d) => (
                    <tr key={d.userId} className="border-t border-border align-top">
                      <td className="px-4 py-2">
                        <p>{d.email || '-'}</p>
                        <p className="text-dim text-xs">{d.blogId || '-'}</p>
                      </td>
                      <td className="px-4 py-2 text-dim text-xs">{d.googleEmail || '(email 조회 실패)'}</td>
                      <td className="px-4 py-2 text-xs">
                        {d.siteVerified && d.siteUrl ? <span className="text-up">{d.siteUrl}</span> : <span className="text-down">미확인</span>}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {d.liveSitesError && <p className="text-down">호출 실패: {d.liveSitesError}</p>}
                        {d.liveSites && d.liveSites.length === 0 && <p className="text-down">이 Google 계정엔 소유권 확인된 GSC 속성이 하나도 없음</p>}
                        {d.liveSites && d.liveSites.length > 0 && (
                          <ul className="space-y-1">
                            {d.liveSites.map((s) => {
                              const key = `${d.userId}:${s.siteUrl}`;
                              return (
                                <li key={s.siteUrl} className="flex items-center gap-2">
                                  <span>{s.siteUrl} <span className="text-dim">({s.permissionLevel})</span></span>
                                  <button
                                    onClick={() => handleAssignSite(d.userId, s.siteUrl)}
                                    disabled={assigningKey === key}
                                    className="text-[10px] font-semibold text-accent border border-accent/40 hover:bg-accent/10 rounded px-1.5 py-0.5 disabled:opacity-50"
                                  >
                                    {assigningKey === key ? '지정 중...' : '이 속성으로 지정'}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {!d.liveSitesError && !d.liveSites && <span className="text-dim">이미 확인됨 (재조회 안 함)</span>}
                      </td>
                    </tr>
                  ))}
                  {data.oauthDiagnostics.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-dim">연결된 Google 계정이 없습니다.</td>
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
