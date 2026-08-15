'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ChallengeStats {
  participated: number;
  top3: number;
  top10: number;
}

interface TopicState {
  count: number;
  topTitles: string[];
  lastSyncedAt: string | null;
}

interface Props {
  challenge: ChallengeStats;
  topic: TopicState;
  /** 연결된 네이버 인플루언서 홈이 있어 수동 동기화가 가능한지 */
  canSync: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '동기화 기록 없음';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '동기화 기록 없음';
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
}

const CardShell = ({ children }: { children: React.ReactNode }) => (
  <div className="h-full flex flex-col bg-surface rounded-lg border border-border shadow-xs p-4 sm:p-5">
    {children}
  </div>
);

const StatRow = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-border/60 last:border-0">
    <span className="text-[13px] text-dim">{label}</span>
    <span className={`font-rank text-[15px] ${accent ? 'text-accent' : 'text-text'} font-bold`}>
      {value.toLocaleString('ko-KR')}
      <span className="text-[11px] text-dim font-normal ml-0.5">개</span>
    </span>
  </div>
);

export default function DashboardHubCards({ challenge, topic, canSync }: Props) {
  const [state, setState] = useState<TopicState>(topic);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/my/topics/sync', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || '동기화에 실패했습니다.');
        return;
      }
      setState({
        count: data.count ?? 0,
        topTitles: Array.isArray(data.topTitles) ? data.topTitles : [],
        lastSyncedAt: data.lastSyncedAt ?? new Date().toISOString(),
      });
    } catch {
      setError('네트워크 오류로 동기화하지 못했습니다.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ── 키워드 챌린지 ── */}
      <CardShell>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-full bg-sunken text-accent flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </span>
          <h3 className="text-sm font-bold text-text">키워드 챌린지</h3>
        </div>
        <div className="flex-1">
          <StatRow label="참여 키워드" value={challenge.participated} accent />
          <StatRow label="TOP 3" value={challenge.top3} />
          <StatRow label="TOP 10" value={challenge.top10} />
        </div>
        <Link
          href="/keywords"
          className="mt-4 inline-flex items-center justify-center w-full px-3 py-2 rounded-lg border border-border text-[13px] font-semibold text-text hover:border-accent transition-colors"
        >
          키워드 챌린지 보기
        </Link>
      </CardShell>

      {/* ── 토픽 (인플루언서 홈 동기화) ── */}
      <CardShell>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-full bg-sunken text-accent flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
            </span>
            <h3 className="text-sm font-bold text-text truncate">토픽</h3>
          </div>
          {canSync && (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-[11px] font-semibold text-dim hover:text-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={syncing ? 'animate-spin' : ''}><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              {syncing ? '동기화 중' : '새로고침'}
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-dim">전체 토픽</span>
            <span className="font-rank text-[20px] font-bold text-accent">
              {state.count.toLocaleString('ko-KR')}
              <span className="text-[11px] text-dim font-normal ml-0.5">개</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-dim">최근 동기화</span>
            <span className="text-[12px] text-text">{formatRelative(state.lastSyncedAt)}</span>
          </div>

          {state.count > 0 && state.topTitles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {state.topTitles.map((t, i) => (
                <span key={i} className="max-w-full truncate px-2 py-0.5 rounded-full bg-sunken text-[11px] text-text border border-border">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-dim mt-1">
              {canSync ? '동기화된 토픽이 없습니다. 새로고침을 눌러 인플루언서 홈에서 가져오세요.' : '등록된 토픽이 없습니다.'}
            </p>
          )}

          {error && <p className="text-[11px] text-down mt-1">{error}</p>}
        </div>

        <Link
          href="/my#topic-performance"
          className="mt-4 inline-flex items-center justify-center w-full px-3 py-2 rounded-lg border border-border text-[13px] font-semibold text-text hover:border-accent transition-colors"
        >
          토픽 성과 보기
        </Link>
      </CardShell>
    </div>
  );
}
