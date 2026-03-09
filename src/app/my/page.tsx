'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface DashboardData {
  linked: boolean;
  influencer: {
    id: string;
    naver_id: string;
    display_name: string;
    category: string;
    image_url?: string;
    subscriber_count?: number;
    total_follower_count?: number;
  } | null;
  stats: {
    total_keywords: number;
    avg_rank: number;
    top3_count: number;
    integrated_top3_count: number;
    rank_up_count: number;
    rank_down_count: number;
  } | null;
  rankings: {
    keyword_id: string;
    keyword: string;
    category: string;
    rank_position: number;
    previous_rank: number | null;
    rank_change: number;
    is_integrated_top3: boolean;
    participant_count: number;
    search_volume_monthly: number;
  }[];
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export default function MyDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const supabase = createSupabaseBrowserClient();
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data: refreshData } = await supabase.auth.refreshSession();
          session = refreshData.session;
        }
        if (!session) {
          setError('login_required');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/my/dashboard', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          setError(res.status === 401 ? 'login_required' : '데이터를 불러올 수 없습니다.');
          setLoading(false);
          return;
        }

        setData(await res.json());
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-dim">대시보드를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error === 'login_required') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent/15 flex items-center justify-center text-accent text-xl font-bold">N</div>
          <h2 className="text-xl font-bold">로그인이 필요합니다</h2>
          <p className="text-sm text-dim">내 키워드 순위를 확인하려면 로그인하세요.</p>
          <Link href="/auth/login"
            className="inline-block px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center text-down text-xl font-bold">!</div>
          <p className="text-sm text-dim">{error}</p>
        </div>
      </div>
    );
  }

  if (!data?.linked || !data.influencer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent/15 flex items-center justify-center text-accent text-xl font-bold">N</div>
          <h2 className="text-xl font-bold">인플루언서 계정을 연결하세요</h2>
          <p className="text-sm text-dim">네이버 인플루언서 계정을 연결하면<br />키워드 순위를 실시간으로 확인할 수 있습니다.</p>
          <Link href="/my/link"
            className="inline-block px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
            계정 연결하기
          </Link>
        </div>
      </div>
    );
  }

  const { influencer, stats, rankings } = data;

  // 순위순 정렬
  const sorted = [...rankings].sort((a, b) => a.rank_position - b.rank_position);

  return (
    <div className="space-y-6">

      {/* ─── 프로필 헤더 ─── */}
      <div className="flex items-center gap-4">
        {influencer.image_url ? (
          <img src={influencer.image_url} alt="" className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 bg-accent/15 rounded-full flex items-center justify-center text-accent text-2xl font-bold">
            {influencer.display_name[0]}
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold">{influencer.display_name}</h1>
          <p className="text-xs text-dim">{influencer.category} · 팬 {formatCount(influencer.subscriber_count || 0)}</p>
        </div>
      </div>

      {/* ─── 주요 지표 4카드 ─── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-dim mb-1">나의 랭킹</p>
            <p className="text-2xl font-black font-rank text-accent">
              {stats.avg_rank > 0 ? `${Math.round(stats.avg_rank)}위` : '-'}
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-dim mb-1">참여 키워드</p>
            <p className="text-2xl font-black font-rank">{stats.total_keywords}개</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-dim mb-1">TOP 3 키워드</p>
            <p className="text-2xl font-black font-rank text-up">{stats.top3_count}개</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-dim mb-1">순위 변동</p>
            <div className="flex items-baseline gap-2">
              {stats.rank_up_count > 0 && (
                <span className="text-lg font-black font-rank text-up">▲{stats.rank_up_count}</span>
              )}
              {stats.rank_down_count > 0 && (
                <span className="text-lg font-black font-rank text-down">▼{stats.rank_down_count}</span>
              )}
              {stats.rank_up_count === 0 && stats.rank_down_count === 0 && (
                <span className="text-lg font-black font-rank text-dim">-</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 키워드 챌린지 순위 ─── */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg/50">
          <h3 className="font-bold text-sm">키워드 챌린지 순위</h3>
          <span className="text-xs text-dim font-rank">{rankings.length}개 키워드</span>
        </div>

        {/* Desktop */}
        <table className="w-full text-sm hidden md:table">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs w-8">#</th>
              <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">키워드</th>
              <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-16">순위</th>
              <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-16">변동</th>
              <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs w-20">참여자</th>
              <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-14">통합</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.keyword_id} className="border-b border-border/30 last:border-0 hover:bg-surface-hover transition-colors">
                <td className="py-2.5 px-4 text-xs text-dim font-rank">{i + 1}</td>
                <td className="py-2.5 px-4">
                  <Link href={`/keywords/${r.keyword_id}`} className="font-medium text-sm hover:text-accent transition-colors">
                    {r.keyword}
                  </Link>
                  <span className="text-[10px] text-dim ml-1.5">{r.category}</span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-sm font-black font-rank ${r.rank_position <= 3 ? 'text-accent' : ''}`}>
                    {r.rank_position}위
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  {r.rank_change > 0 ? (
                    <span className="text-xs font-bold text-up">▲{r.rank_change}</span>
                  ) : r.rank_change < 0 ? (
                    <span className="text-xs font-bold text-down">▼{Math.abs(r.rank_change)}</span>
                  ) : (
                    <span className="text-xs text-dim">-</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right text-xs text-dim font-rank">{r.participant_count}명</td>
                <td className="py-2.5 px-3 text-center">
                  {r.is_integrated_top3 && <span className="text-xs font-bold text-gold">T3</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border/30">
          {sorted.map((r, i) => (
            <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-dim font-rank w-5">{i + 1}</span>
                <div className="min-w-0">
                  <span className="font-medium text-sm truncate block">{r.keyword}</span>
                  <span className="text-[10px] text-dim">{r.category} · {r.participant_count}명</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {r.rank_change !== 0 && (
                  <span className={`text-xs font-bold ${r.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                    {r.rank_change > 0 ? '▲' : '▼'}{Math.abs(r.rank_change)}
                  </span>
                )}
                <span className={`text-sm font-black font-rank ${r.rank_position <= 3 ? 'text-accent' : ''}`}>
                  {r.rank_position}위
                </span>
                {r.is_integrated_top3 && <span className="text-xs font-bold text-gold">T3</span>}
              </div>
            </Link>
          ))}
        </div>

        {rankings.length === 0 && (
          <div className="text-center py-12 text-dim text-sm">아직 키워드 순위 데이터가 없습니다.</div>
        )}
      </div>

      {/* ─── 누적 활동 현황 ─── */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <h3 className="font-bold text-sm mb-3">활동 현황</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.subscriber_count || 0)}</p>
            <p className="text-[11px] text-dim mt-0.5">팬수</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{stats?.total_keywords || 0}</p>
            <p className="text-[11px] text-dim mt-0.5">참여 키워드</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.total_follower_count || 0)}</p>
            <p className="text-[11px] text-dim mt-0.5">팔로워</p>
          </div>
        </div>
      </div>
    </div>
  );
}
