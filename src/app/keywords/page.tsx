'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import TrendBadge from '@/components/TrendBadge';
import { mockKeywords, CATEGORIES } from '@/data/mock-keywords';

type SortKey = 'search_volume_monthly' | 'participant_count' | 'recommendation_score' | 'competition_level';

export default function KeywordsPage() {
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recommendation_score');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = [...mockKeywords];
    if (category !== '전체') list = list.filter(k => k.category === category);
    if (search.trim()) list = list.filter(k => k.keyword.includes(search.trim()));
    list.sort((a, b) => {
      const compMap = { low: 1, medium: 2, high: 3 };
      let av: number, bv: number;
      if (sortKey === 'competition_level') {
        av = compMap[a.competition_level]; bv = compMap[b.competition_level];
      } else { av = a[sortKey]; bv = b[sortKey]; }
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [category, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const compBadge = (level: string) => {
    if (level === 'low') return <span className="text-xs font-bold text-up bg-up/12 px-2 py-0.5 rounded-full">낮음</span>;
    if (level === 'medium') return <span className="text-xs font-bold text-gold bg-gold/12 px-2 py-0.5 rounded-full">보통</span>;
    return <span className="text-xs font-bold text-down bg-down/12 px-2 py-0.5 rounded-full">높음</span>;
  };

  const sortIcon = (key: SortKey) => sortKey !== key ? '' : sortAsc ? ' ↑' : ' ↓';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">키워드 전체 목록</h1>
        <span className="text-xs text-dim font-rank">{filtered.length}개</span>
      </div>

      <input type="text" placeholder="키워드 검색..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors" />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              category === cat ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:border-accent/40'
            }`}>{cat}</button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/50">
              <th className="text-left py-3 px-4 font-semibold text-dim text-xs">키워드</th>
              <th className="text-left py-3 px-4 font-semibold text-dim text-xs">카테고리</th>
              <th className="text-right py-3 px-4 font-semibold text-dim text-xs cursor-pointer select-none hover:text-accent" onClick={() => toggleSort('search_volume_monthly')}>검색량{sortIcon('search_volume_monthly')}</th>
              <th className="text-right py-3 px-4 font-semibold text-dim text-xs cursor-pointer select-none hover:text-accent" onClick={() => toggleSort('participant_count')}>참여자{sortIcon('participant_count')}</th>
              <th className="text-center py-3 px-4 font-semibold text-dim text-xs cursor-pointer select-none hover:text-accent hidden lg:table-cell" onClick={() => toggleSort('competition_level')}>경쟁도{sortIcon('competition_level')}</th>
              <th className="text-right py-3 px-4 font-semibold text-dim text-xs">트렌드</th>
              <th className="text-right py-3 px-4 font-semibold text-dim text-xs cursor-pointer select-none hover:text-accent" onClick={() => toggleSort('recommendation_score')}>추천{sortIcon('recommendation_score')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(kw => (
              <tr key={kw.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                <td className="py-3 px-4">
                  <Link href={`/keywords/${kw.id}`} className="font-bold hover:text-accent transition-colors">
                    {kw.keyword}
                    {kw.is_new && <span className="ml-1.5 text-[10px] font-bold text-accent2 bg-accent2/12 px-1.5 py-0.5 rounded">NEW</span>}
                    {kw.trend_direction === 'up' && kw.trend_percentage > 30 && <span className="ml-1.5 text-[10px] font-bold text-down bg-down/12 px-1.5 py-0.5 rounded">HOT</span>}
                  </Link>
                </td>
                <td className="py-3 px-4 text-xs text-dim">{kw.category}</td>
                <td className="py-3 px-4 text-right font-bold font-rank">{kw.search_volume_monthly.toLocaleString()}</td>
                <td className="py-3 px-4 text-right text-dim font-rank">{kw.participant_count}</td>
                <td className="py-3 px-4 text-center hidden lg:table-cell">{compBadge(kw.competition_level)}</td>
                <td className="py-3 px-4 text-right"><TrendBadge direction={kw.trend_direction} percentage={kw.trend_percentage} /></td>
                <td className="py-3 px-4 text-right">
                  <span className={`text-sm font-extrabold font-rank ${kw.recommendation_score >= 8 ? 'text-accent' : kw.recommendation_score >= 6 ? 'text-gold' : 'text-dim'}`}>{kw.recommendation_score}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(kw => (
          <Link key={kw.id} href={`/keywords/${kw.id}`}
            className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{kw.keyword}</span>
                {kw.is_new && <span className="text-[10px] font-bold text-accent2 bg-accent2/12 px-1.5 py-0.5 rounded">NEW</span>}
                {kw.trend_direction === 'up' && kw.trend_percentage > 30 && <span className="text-[10px] font-bold text-down bg-down/12 px-1.5 py-0.5 rounded">HOT</span>}
              </div>
              <span className={`text-sm font-extrabold font-rank ${kw.recommendation_score >= 8 ? 'text-accent' : kw.recommendation_score >= 6 ? 'text-gold' : 'text-dim'}`}>{kw.recommendation_score}</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-dim">{kw.category}</span>
              {compBadge(kw.competition_level)}
              <TrendBadge direction={kw.trend_direction} percentage={kw.trend_percentage} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">검색량</span>
                <span className="font-bold font-rank">{kw.search_volume_monthly.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">참여자</span>
                <span className="font-rank">{kw.participant_count}명</span>
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>}
      </div>
    </div>
  );
}
