'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import RankBadge from '@/components/RankBadge';
import RankChange from '@/components/RankChange';
import RankHistoryChart from '@/components/RankHistoryChart';
import CompetitorBarChart from '@/components/CompetitorBarChart';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { SERIES_COLORS } from '@/lib/chart-colors';

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
    rank_history: number[];
    rank_history_dates: string[];
  }[];
  competitors: {
    keyword: string;
    competitors: { name: string; rank: number; isMe: boolean }[];
  }[];
  guide: {
    factor: string;
    status: string;
    message: string;
    action: string;
  }[];
}

type SortKey = 'rank_position' | 'search_volume_monthly' | 'rank_change';
type Filter = 'all' | 'top3' | 'integrated' | 'up';

const CHART_COLORS = SERIES_COLORS;

export default function MyDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('rank_position');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedCompetitor, setSelectedCompetitor] = useState(0);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const supabase = createSupabaseBrowserClient();

        // refreshSession()으로 토큰 갱신 + 세션 가져오기
        let { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // 세션 없으면 강제 갱신 시도
          const { data: refreshData } = await supabase.auth.refreshSession();
          session = refreshData.session;
        }

        if (!session) {
          setError('login_required');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/my/dashboard', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          if (res.status === 401) {
            setError('login_required');
          } else {
            setError('데이터를 불러올 수 없습니다.');
          }
          setLoading(false);
          return;
        }

        const dashData = await res.json();
        setData(dashData);
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
          <p className="text-sm text-dim">내 대시보드 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error === 'login_required') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent/15 flex items-center justify-center text-accent text-xl font-bold">?</div>
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
          <p className="text-sm text-dim">네이버 인플루언서 계정을 연결하면 키워드 순위를 실시간으로 확인할 수 있습니다.</p>
          <Link href="/my/link"
            className="inline-block px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
            계정 연결하기
          </Link>
        </div>
      </div>
    );
  }

  const { influencer, stats, rankings, competitors, guide } = data;

  const filtered = rankings
    .filter(r => {
      if (filter === 'top3') return r.rank_position <= 3;
      if (filter === 'integrated') return r.is_integrated_top3;
      if (filter === 'up') return r.rank_change > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'rank_position') return a.rank_position - b.rank_position;
      if (sortBy === 'search_volume_monthly') return b.search_volume_monthly - a.search_volume_monthly;
      return Math.abs(b.rank_change) - Math.abs(a.rank_change);
    });

  return (
    <div className="space-y-6">
      {/* 프로필 헤더 */}
      <div className="bg-gradient-to-r from-accent to-accent2 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          {influencer.image_url ? (
            <img src={influencer.image_url} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
              {influencer.display_name[0]}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{influencer.display_name}</h1>
            <p className="text-sm text-white/80">{influencer.category}</p>
            <p className="text-xs text-white/60 mt-1">
              구독자 {(influencer.subscriber_count || 0).toLocaleString()} · 팔로워 {(influencer.total_follower_count || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* 요약 카드 */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="참여 키워드" value={`${stats.total_keywords}개`} icon="KEY" color="accent" />
          <StatCard label="평균 순위" value={`${stats.avg_rank}위`} icon="AVG" color="blue" />
          <StatCard label="TOP 3 키워드" value={`${stats.top3_count}개`} icon="TOP" color="green" />
          <StatCard label="통합검색 TOP3" value={`${stats.integrated_top3_count}개`} icon="INT" color="orange" />
        </div>
      )}

      {/* 순위 변동 차트 */}
      {rankings.length > 0 && rankings[0].rank_history.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="font-bold text-sm mb-4">최근 순위 추이</h3>
          <RankHistoryChart
            dates={rankings[0].rank_history_dates}
            keywords={rankings.slice(0, 5).map((r, i) => ({
              keyword: r.keyword,
              ranks: r.rank_history,
              color: CHART_COLORS[i],
            }))}
          />
          <div className="flex flex-wrap gap-3 mt-3">
            {rankings.slice(0, 5).map((r, i) => (
              <div key={r.keyword_id} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[i] }} />
                <span className="text-dim">{r.keyword}</span>
                <span className="font-bold font-rank">{r.rank_position}위</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 + 정렬 */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {([['all', '전체'], ['top3', 'TOP 3만'], ['integrated', '통합 TOP3'], ['up', '순위 상승']] as [Filter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                filter === key ? 'bg-accent text-white' : 'bg-surface text-dim border border-border hover:border-accent/40'
              }`}>{label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {([['rank_position', '순위순'], ['search_volume_monthly', '검색량순'], ['rank_change', '변동폭순']] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                sortBy === key ? 'bg-text text-bg' : 'bg-surface text-dim border border-border'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* 순위 테이블 (Desktop) */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/50">
              <th className="text-left p-3 font-semibold text-dim text-xs">키워드</th>
              <th className="text-center p-3 font-semibold text-dim text-xs w-16">순위</th>
              <th className="text-center p-3 font-semibold text-dim text-xs w-16">변동</th>
              <th className="text-right p-3 font-semibold text-dim text-xs w-20">참여자</th>
              <th className="text-right p-3 font-semibold text-dim text-xs w-24">검색량</th>
              <th className="text-center p-3 font-semibold text-dim text-xs w-16">통합</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.keyword_id} className="border-b border-border/50 hover:bg-surface-hover transition">
                <td className="p-3">
                  <Link href={`/keywords/${r.keyword_id}`} className="font-medium hover:text-accent transition-colors">
                    {r.keyword}
                  </Link>
                  <span className="text-xs text-dim ml-2">{r.category}</span>
                </td>
                <td className="text-center p-3"><RankBadge rank={r.rank_position} /></td>
                <td className="text-center p-3"><RankChange change={r.rank_change} /></td>
                <td className="text-right p-3 text-dim font-rank">{r.participant_count}명</td>
                <td className="text-right p-3 font-medium font-rank">{r.search_volume_monthly.toLocaleString()}</td>
                <td className="text-center p-3">{r.is_integrated_top3 && <span className="text-gold font-bold text-xs">T3</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-dim text-sm">해당 조건의 키워드가 없습니다.</div>
        )}
      </div>

      {/* 순위 카드 (Mobile) */}
      <div className="lg:hidden space-y-3">
        {filtered.map((r) => (
          <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
            className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-bold">{r.keyword}</span>
                <span className="text-xs text-dim ml-2">{r.category}</span>
              </div>
              {r.is_integrated_top3 && <span className="text-gold text-sm font-bold">T3</span>}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="mb-1"><RankBadge rank={r.rank_position} size="sm" /></div>
                <p className="text-[10px] text-dim">순위</p>
              </div>
              <div>
                <div className="mb-1"><RankChange change={r.rank_change} /></div>
                <p className="text-[10px] text-dim">변동</p>
              </div>
              <div>
                <p className="text-sm font-bold font-rank">{r.participant_count}</p>
                <p className="text-[10px] text-dim">참여자</p>
              </div>
              <div>
                <p className="text-sm font-bold font-rank">{(r.search_volume_monthly / 1000).toFixed(0)}K</p>
                <p className="text-[10px] text-dim">검색량</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 경쟁자 비교 */}
      {competitors.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="font-bold text-sm mb-3">경쟁자 비교</h3>
          <div className="flex gap-2 mb-4 flex-wrap">
            {competitors.map((cd, i) => (
              <button key={cd.keyword} onClick={() => setSelectedCompetitor(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  selectedCompetitor === i ? 'bg-accent text-white' : 'bg-surface-hover text-dim border border-border'
                }`}>{cd.keyword}</button>
            ))}
          </div>
          <CompetitorBarChart data={competitors[selectedCompetitor]?.competitors || []} />
        </div>
      )}

      {/* 순위 상승 가이드 */}
      {guide.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="font-bold text-sm mb-4">순위 상승 가이드</h3>
          <div className="space-y-3">
            {guide.map((g, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                g.status === 'warning' ? 'border-gold/30 bg-gold/5' :
                g.status === 'actionable' ? 'border-accent/30 bg-accent/5' :
                'border-up/30 bg-up/5'
              }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  g.status === 'warning' ? 'bg-gold/20 text-gold' :
                  g.status === 'opportunity' ? 'bg-up/20 text-up' :
                  'bg-accent/20 text-accent'
                }`}>{g.status === 'warning' ? '!' : g.status === 'opportunity' ? 'GO' : 'TIP'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-text">{g.factor}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      g.status === 'warning' ? 'bg-gold/15 text-gold' :
                      g.status === 'actionable' ? 'bg-accent/15 text-accent' :
                      'bg-up/15 text-up'
                    }`}>{g.status === 'warning' ? '주의' : g.status === 'opportunity' ? '기회' : '실행'}</span>
                  </div>
                  <p className="text-xs text-dim">{g.message}</p>
                  <p className="text-xs text-text mt-1 font-medium">{g.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
