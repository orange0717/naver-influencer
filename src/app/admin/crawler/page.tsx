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

interface Backlog {
  last_crawl_null: number;
  fans_without_challenge_date: number;
  challenge_rows_missing_owner_id: number;
  total_influencer_rows: number;
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
  const [backlog, setBacklog] = useState<Backlog | null>(null);
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
      setBacklog(data.backlog ?? null);
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

          {backlog && (
            <section className="space-y-3">
              <h2 className="text-base font-bold">챌린지·순위 수집 백로그 요약</h2>
              <p className="text-xs text-dim leading-relaxed -mt-1">
                공개 인플 목록에서 챌린지 수·TOP3가 비고 날짜만 맞지 않아 보일 때, 아래 숫자로 원인을 빠르게 좁힐 수 있습니다.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="전체 인플 DB 행"
                  value={backlog.total_influencer_rows.toLocaleString()}
                  sub="influencers 테이블"
                />
                <StatCard
                  label="순위 수집 전 (last_crawl 없음)"
                  value={backlog.last_crawl_null.toLocaleString()}
                  sub="crawl-challenge-ranks 큐 1순위"
                  tone={backlog.last_crawl_null > 500 ? 'down' : backlog.last_crawl_null > 0 ? 'neutral' : 'up'}
                />
                <StatCard
                  label="팬수 있는데 참여일 없음"
                  value={backlog.fans_without_challenge_date.toLocaleString()}
                  sub="last_challenged_at NULL"
                  tone={backlog.fans_without_challenge_date > 1000 ? 'down' : 'neutral'}
                />
                <StatCard
                  label="키워드 이력인데 ownerId 없음"
                  value={backlog.challenge_rows_missing_owner_id.toLocaleString()}
                  sub="participated API 불가"
                  tone={backlog.challenge_rows_missing_owner_id > 0 ? 'down' : 'up'}
                />
              </div>
              <ul className="text-xs text-dim space-y-1.5 list-disc list-inside bg-bg/50 border border-border/60 rounded-lg px-4 py-3">
                <li>
                  <strong className="text-text">순위 수집 전</strong>은 아직 한 번도 챌린지 순위 크롤이 끝까지 반영되지 않은 행입니다. 피드만 타고 들어온 계정이 여기에 많이 쌓일 수 있습니다.
                </li>
                <li>
                  <strong className="text-text">팬수 O · 참여일 없음</strong>은 프로필(팬)은 있으나 네이버 챌린지 참여 시각을 못 받은 상태입니다. 순위 수집이 성공하면 같이 채워집니다.
                </li>
                <li>
                  <strong className="text-text">ownerId 없음</strong>은 참여 키워드 수는 있는데 내부 ownerId가 비어 participated API를 못 부르는 경우입니다. in.naver.com HTML 파싱 실패·차단을 의심합니다.
                </li>
              </ul>
            </section>
          )}
        </>
      )}

      {summary && !backlog && (
        <p className="text-xs text-dim">백로그 요약은 최신 API 배포 후 표시됩니다.</p>
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
