'use client';

import { useState } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import RankBadge from '@/components/RankBadge';
import RankChange from '@/components/RankChange';
import RankHistoryChart from '@/components/RankHistoryChart';
import CompetitorBarChart from '@/components/CompetitorBarChart';
import type { MyKeywordRanking } from '@/lib/types';

const myInfluencer = {
  id: 'inf-003',
  naver_id: 'orangelibrary',
  display_name: '오렌지도서관',
  category: '도서 전문블로거 · 소설 전문',
  fan_count: 209,
  blog_neighbor_count: 4200,
};

const myRankings: (MyKeywordRanking & { rank_history: number[] })[] = [
  { keyword_id: 'kw-003', keyword: '행복명언', category: '자기계발', rank_position: 1, previous_rank: 1, rank_change: 0, participant_count: 71, search_volume_monthly: 33100, is_integrated_top3: true, rank_history: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1] },
  { keyword_id: 'kw-004', keyword: '독서노트작성법', category: '도서', rank_position: 2, previous_rank: 3, rank_change: 1, participant_count: 45, search_volume_monthly: 12400, is_integrated_top3: true, rank_history: [4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2] },
  { keyword_id: 'kw-006', keyword: '한줄명언', category: '자기계발', rank_position: 3, previous_rank: 3, rank_change: 0, participant_count: 52, search_volume_monthly: 21500, is_integrated_top3: true, rank_history: [3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
  { keyword_id: 'kw-012', keyword: '소설추천', category: '도서', rank_position: 5, previous_rank: 3, rank_change: -2, participant_count: 128, search_volume_monthly: 58200, is_integrated_top3: false, rank_history: [3, 3, 3, 4, 4, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5] },
  { keyword_id: 'kw-013', keyword: '자기계발책추천', category: '자기계발', rank_position: 8, previous_rank: 11, rank_change: 3, participant_count: 203, search_volume_monthly: 89100, is_integrated_top3: false, rank_history: [15, 14, 13, 12, 11, 11, 11, 10, 9, 9, 8, 8, 8, 8, 8] },
  { keyword_id: 'kw-014', keyword: '에세이추천', category: '도서', rank_position: 4, previous_rank: 5, rank_change: 1, participant_count: 85, search_volume_monthly: 28400, is_integrated_top3: false, rank_history: [6, 6, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4] },
  { keyword_id: 'kw-015', keyword: '인생책', category: '도서', rank_position: 6, previous_rank: 6, rank_change: 0, participant_count: 112, search_volume_monthly: 44200, is_integrated_top3: false, rank_history: [6, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
];

const historyDates = Array.from({ length: 15 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (14 - i));
  return d.toISOString().split('T')[0];
});

const CHART_COLORS = ['#6C5CE7', '#E94560', '#00D68F', '#4D9FFF', '#FFD93D', '#FF6B6B', '#CD7F32'];

const guide = [
  { factor: '서비스 활성도', status: 'warning', message: '참여 키워드 7개 / 전체 336개 (2.1%)', action: '30개 이상 참여 확대 권장' },
  { factor: '인게이지먼트', status: 'actionable', message: '평균 조회수 3.4회', action: '콘텐츠 홍보 및 SNS 공유 필요' },
  { factor: 'TOP 3 기회', status: 'opportunity', message: "'에세이추천' 4위 — TOP 3까지 1단계", action: '콘텐츠 품질 개선으로 TOP 3 진입 가능' },
];

const competitorData = [
  { keyword: '행복명언', competitors: [
    { name: '오렌지도서관', rank: 1, isMe: true },
    { name: '여르미', rank: 2, isMe: false },
    { name: '북레터', rank: 3, isMe: false },
  ]},
  { keyword: '독서노트작성법', competitors: [
    { name: '책읽는곰', rank: 1, isMe: false },
    { name: '오렌지도서관', rank: 2, isMe: true },
    { name: '독서왕', rank: 3, isMe: false },
  ]},
];

type SortKey = 'rank_position' | 'search_volume_monthly' | 'rank_change';
type Filter = 'all' | 'top3' | 'integrated' | 'up';

export default function MyDashboard() {
  const [sortBy, setSortBy] = useState<SortKey>('rank_position');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedCompetitor, setSelectedCompetitor] = useState(0);

  const totalKeywords = myRankings.length;
  const avgRank = (myRankings.reduce((s, r) => s + r.rank_position, 0) / totalKeywords).toFixed(1);
  const top3Count = myRankings.filter(r => r.rank_position <= 3).length;
  const integratedCount = myRankings.filter(r => r.is_integrated_top3).length;

  const filtered = myRankings
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
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
            {myInfluencer.display_name[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold">{myInfluencer.display_name}</h1>
            <p className="text-sm text-white/80">{myInfluencer.category}</p>
            <p className="text-xs text-white/60 mt-1">
              팬 {myInfluencer.fan_count.toLocaleString()} · 블로그 이웃 {myInfluencer.blog_neighbor_count.toLocaleString()}+
            </p>
          </div>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="참여 키워드" value={`${totalKeywords}개`} icon="🔑" color="accent" />
        <StatCard label="평균 순위" value={`${avgRank}위`} icon="📊" color="blue" />
        <StatCard label="TOP 3 키워드" value={`${top3Count}개`} icon="🏆" color="green" />
        <StatCard label="통합검색 TOP3" value={`${integratedCount}개`} icon="⭐" color="orange" />
      </div>

      {/* 순위 변동 차트 (Recharts) */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-4">최근 15일 순위 추이</h3>
        <RankHistoryChart
          dates={historyDates}
          keywords={myRankings.slice(0, 5).map((r, i) => ({
            keyword: r.keyword,
            ranks: r.rank_history,
            color: CHART_COLORS[i],
          }))}
        />
        <div className="flex flex-wrap gap-3 mt-3">
          {myRankings.slice(0, 5).map((r, i) => (
            <div key={r.keyword_id} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[i] }} />
              <span className="text-dim">{r.keyword}</span>
              <span className="font-bold font-rank">{r.rank_position}위</span>
            </div>
          ))}
        </div>
      </div>

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
                <td className="text-center p-3">{r.is_integrated_top3 && <span className="text-gold">★</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
              {r.is_integrated_top3 && <span className="text-gold text-sm">★ 통합</span>}
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
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">경쟁자 비교</h3>
        <div className="flex gap-2 mb-4 flex-wrap">
          {competitorData.map((cd, i) => (
            <button key={cd.keyword} onClick={() => setSelectedCompetitor(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                selectedCompetitor === i ? 'bg-accent text-white' : 'bg-surface-hover text-dim border border-border'
              }`}>{cd.keyword}</button>
          ))}
        </div>
        <CompetitorBarChart data={competitorData[selectedCompetitor].competitors} />
      </div>

      {/* 순위 상승 가이드 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-4">순위 상승 가이드</h3>
        <div className="space-y-3">
          {guide.map((g, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
              g.status === 'warning' ? 'border-gold/30 bg-gold/5' :
              g.status === 'actionable' ? 'border-accent/30 bg-accent/5' :
              'border-up/30 bg-up/5'
            }`}>
              <span className="text-lg">{g.status === 'warning' ? '⚠️' : g.status === 'opportunity' ? '🎯' : '💡'}</span>
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
    </div>
  );
}
