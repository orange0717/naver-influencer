'use client';

import { useState } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import RankBadge from '@/components/RankBadge';
import RankChange from '@/components/RankChange';
import type { MyKeywordRanking } from '@/lib/types';

const myInfluencer = {
  id: 'inf-003',
  naver_id: 'orangelibrary',
  display_name: '오렌지도서관',
  category: '도서 전문블로거 · 소설 전문',
  fan_count: 209,
  blog_neighbor_count: 4200,
};

const myRankings: MyKeywordRanking[] = [
  { keyword_id: 'kw-003', keyword: '행복명언', category: '자기계발', rank_position: 1, previous_rank: 1, rank_change: 0, participant_count: 71, search_volume_monthly: 33100, is_integrated_top3: true },
  { keyword_id: 'kw-004', keyword: '독서노트작성법', category: '도서', rank_position: 2, previous_rank: 3, rank_change: 1, participant_count: 45, search_volume_monthly: 12400, is_integrated_top3: true },
  { keyword_id: 'kw-006', keyword: '한줄명언', category: '자기계발', rank_position: 3, previous_rank: 3, rank_change: 0, participant_count: 52, search_volume_monthly: 21500, is_integrated_top3: true },
  { keyword_id: 'kw-012', keyword: '소설추천', category: '도서', rank_position: 5, previous_rank: 3, rank_change: -2, participant_count: 128, search_volume_monthly: 58200, is_integrated_top3: false },
  { keyword_id: 'kw-013', keyword: '자기계발책추천', category: '자기계발', rank_position: 8, previous_rank: 11, rank_change: 3, participant_count: 203, search_volume_monthly: 89100, is_integrated_top3: false },
  { keyword_id: 'kw-014', keyword: '에세이추천', category: '도서', rank_position: 4, previous_rank: 5, rank_change: 1, participant_count: 85, search_volume_monthly: 28400, is_integrated_top3: false },
  { keyword_id: 'kw-015', keyword: '인생책', category: '도서', rank_position: 6, previous_rank: 6, rank_change: 0, participant_count: 112, search_volume_monthly: 44200, is_integrated_top3: false },
];

// 순위 히스토리 (15일간)
const rankHistories: Record<string, number[]> = {
  '행복명언': [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  '독서노트작성법': [4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2],
  '소설추천': [3, 3, 3, 4, 4, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5],
};

// 순위 상승 가이드
const guide = [
  { factor: '서비스 활성도', status: 'warning', message: '참여 키워드 7개 / 전체 336개 (2.1%)', action: '30개 이상 참여 확대 권장' },
  { factor: '인게이지먼트', status: 'actionable', message: '평균 조회수 3.4회', action: '콘텐츠 홍보 및 SNS 공유 필요' },
  { factor: 'TOP 3 기회', status: 'opportunity', message: "'에세이추천' 4위 — TOP 3까지 1단계", action: '콘텐츠 품질 개선으로 TOP 3 진입 가능' },
];

type SortKey = 'rank_position' | 'search_volume_monthly' | 'rank_change';
type Filter = 'all' | 'top3' | 'integrated' | 'up';

export default function MyDashboard() {
  const [sortBy, setSortBy] = useState<SortKey>('rank_position');
  const [filter, setFilter] = useState<Filter>('all');

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

      {/* 순위 변동 차트 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-4">최근 15일 순위 추이</h3>
        <div className="space-y-4">
          {Object.entries(rankHistories).map(([keyword, history]) => {
            const maxRank = Math.max(...history);
            return (
              <div key={keyword} className="flex items-center gap-3">
                <span className="text-xs font-semibold w-24 truncate text-dim">{keyword}</span>
                <div className="flex-1 flex items-end gap-[2px] h-8">
                  {history.map((rank, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full rounded-sm transition-colors ${rank <= 1 ? 'bg-gold' : rank <= 3 ? 'bg-accent' : 'bg-accent/30'}`}
                        style={{ height: `${Math.max(20, (1 - (rank - 1) / maxRank) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-xs font-bold font-rank w-8 text-right">{history[history.length - 1]}위</span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-dim mt-2 px-27">
          <span>15일 전</span>
          <span>오늘</span>
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

      {/* 순위 테이블 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/50">
              <th className="text-left p-3 font-semibold text-dim text-xs">키워드</th>
              <th className="text-center p-3 font-semibold text-dim text-xs w-16">순위</th>
              <th className="text-center p-3 font-semibold text-dim text-xs w-16">변동</th>
              <th className="text-right p-3 font-semibold text-dim text-xs w-20 hidden sm:table-cell">참여자</th>
              <th className="text-right p-3 font-semibold text-dim text-xs w-24 hidden md:table-cell">검색량</th>
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
                <td className="text-right p-3 text-dim hidden sm:table-cell font-rank">{r.participant_count}명</td>
                <td className="text-right p-3 font-medium hidden md:table-cell font-rank">{r.search_volume_monthly.toLocaleString()}</td>
                <td className="text-center p-3">{r.is_integrated_top3 && <span className="text-gold">★</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

      {/* 경쟁자 비교 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">통합검색 TOP 3 키워드 경쟁 현황</h3>
        <div className="space-y-2">
          {myRankings.filter(r => r.is_integrated_top3).map(r => (
            <div key={r.keyword_id} className="flex items-center gap-3 text-sm">
              <span className="font-semibold w-24 truncate">{r.keyword}</span>
              <span className="bg-accent/15 text-accent px-2 py-0.5 rounded-full text-xs font-bold">나 {r.rank_position}위</span>
              <span className="text-dim text-xs">/ {r.participant_count}명 참여</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
