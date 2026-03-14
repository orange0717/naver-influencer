'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface RankedInfluencer {
  rank: number;
  rankChange: number;
  isNew: boolean;
  naverId: string;
  displayName: string;
  imageUrl: string;
  category: string;
  categoryMyType: string;
  subscriberCount: number;
  rank1Count: number;
  top3Count: number;
  top10Count: number;
  integratedCount: number;
  totalKeywords: number;
  firstSeenAt: string | null;
}

type SortType = 'rank1' | 'top3' | 'keywords' | 'fans';

export default function RankingsPage() {
  const [rankings, setRankings] = useState<RankedInfluencer[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortType>('rank1');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [snapshotDate, setSnapshotDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sort,
      });
      if (category !== '전체') params.set('category', category);

      const res = await fetch(`/api/rankings/influencers?${params}`);
      const data = await res.json();

      setRankings(data.rankings || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
      setSnapshotDate(data.snapshot_date || '');
    } catch (err) {
      console.error('랭킹 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [page, category, sort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortOptions: { key: SortType; label: string }[] = [
    { key: 'rank1', label: '1위 키워드' },
    { key: 'top3', label: 'TOP 3' },
    { key: 'keywords', label: '유효 키워드' },
    { key: 'fans', label: '팬 수' },
  ];

  const renderRankChange = (change: number, isNew: boolean) => {
    if (isNew) return <span className="text-[11px] text-up font-bold">NEW</span>;
    if (change > 0) return <span className="text-[11px] text-up font-bold">▲{change}</span>;
    if (change < 0) return <span className="text-[11px] text-down font-bold">▼{Math.abs(change)}</span>;
    return <span className="text-[11px] text-dim">-</span>;
  };

  const getGradeLabel = (inf: RankedInfluencer) => {
    if (inf.rank1Count >= 3) return { label: '1', color: 'text-yellow-500' };
    if (inf.rank1Count >= 1) return { label: '2', color: 'text-accent' };
    if (inf.top3Count >= 3) return { label: '3', color: 'text-up' };
    if (inf.top3Count >= 1) return { label: '4', color: 'text-blue-500' };
    if (inf.totalKeywords >= 3) return { label: '5', color: 'text-dim' };
    return { label: '-', color: 'text-border' };
  };

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">인플루언서 랭킹 <span className="text-sm font-medium text-dim">(업데이트중)</span></h1>
          <p className="text-xs text-dim mt-0.5">
            키워드 챌린지 순위 기반
            {snapshotDate && ` · ${snapshotDate.replace(/-/g, '.')} 기준`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rankings/bloggers" className="text-xs text-accent font-semibold hover:underline">
            블로거 랭킹 →
          </Link>
          <span className="text-xs text-dim font-rank">
            {loading ? '집계 중...' : `총 ${total.toLocaleString()}명`}
          </span>
        </div>
      </div>

      {/* 정렬 옵션 */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-dim font-semibold mr-1">정렬:</span>
        {sortOptions.map(opt => (
          <button key={opt.key} onClick={() => { setSort(opt.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              sort === opt.key ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:border-accent/40'
            }`}>{opt.label}</button>
        ))}
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button key={cat} onClick={() => { setCategory(cat); setPage(1); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              category === cat ? 'bg-accent/20 text-accent border border-accent/30' : 'bg-surface border border-border text-dim hover:border-accent/40'
            }`}>{cat}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">랭킹 데이터를 집계하는 중...</p>
          </div>
        </div>
      ) : rankings.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-dim text-sm">아직 순위 데이터가 없습니다.</p>
        </div>
      ) : (
        <>
          {/* BlogChart 스타일 테이블 (Desktop) */}
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-bg/50">
                  <th className="text-center py-3 px-3 font-bold text-dim text-xs w-20">전체랭킹</th>
                  <th className="text-left py-3 px-4 font-bold text-dim text-xs">인플루언서</th>
                  <th className="text-center py-3 px-3 font-bold text-dim text-xs">메인 카테고리</th>
                  <th className="text-center py-3 px-3 font-bold text-dim text-xs">유효 키워드</th>
                  <th className="text-center py-3 px-3 font-bold text-dim text-xs">순위등급</th>
                  <th className="text-center py-3 px-3 font-bold text-dim text-xs">최고랭킹</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((inf) => {
                  const grade = getGradeLabel(inf);
                  return (
                    <tr key={inf.naverId} className="border-b border-border/40 hover:bg-surface-hover/50 transition-colors">
                      {/* 전체랭킹 */}
                      <td className="py-4 px-3 text-center">
                        <div className="font-black text-lg font-rank">{inf.rank}</div>
                        <div>{renderRankChange(inf.rankChange, inf.isNew)}</div>
                      </td>

                      {/* 인플루언서 */}
                      <td className="py-4 px-4">
                        <Link href={`/influencers/${inf.naverId}`} className="flex items-center gap-3 group">
                          {inf.imageUrl ? (
                            <img src={inf.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                              {inf.displayName.charAt(0)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-sm group-hover:text-accent transition-colors truncate max-w-[200px]">
                              {inf.displayName}
                            </div>
                            <div className="text-[11px] text-dim">in.naver.com/{inf.naverId}</div>
                          </div>
                        </Link>
                      </td>

                      {/* 메인 카테고리 */}
                      <td className="py-4 px-3 text-center">
                        <span className="text-xs font-semibold text-dim">{inf.category || '-'}</span>
                      </td>

                      {/* 유효 키워드 */}
                      <td className="py-4 px-3 text-center">
                        <span className="font-black font-rank text-sm">{inf.totalKeywords}</span>
                        <div className="text-[10px] text-dim">개</div>
                      </td>

                      {/* 순위등급 */}
                      <td className="py-4 px-3 text-center">
                        <span className={`font-black font-rank text-lg ${grade.color}`}>
                          {grade.label}
                        </span>
                      </td>

                      {/* 최고랭킹 */}
                      <td className="py-4 px-3 text-center">
                        <div className="font-black font-rank text-base">
                          {inf.rank1Count > 0 ? inf.rank1Count : '-'}
                        </div>
                        {inf.isNew && (
                          <span className="text-[10px] font-bold text-white bg-up px-1.5 py-0.5 rounded">NEW</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-2">
            {rankings.map((inf) => {
              const grade = getGradeLabel(inf);
              return (
                <Link key={inf.naverId} href={`/influencers/${inf.naverId}`}
                  className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/30 transition">
                  <div className="flex items-center gap-3">
                    {/* 순위 */}
                    <div className="text-center shrink-0 w-10">
                      <div className="font-black text-lg font-rank">{inf.rank}</div>
                      <div>{renderRankChange(inf.rankChange, inf.isNew)}</div>
                    </div>

                    {/* 프로필 */}
                    {inf.imageUrl ? (
                      <img src={inf.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                        {inf.displayName.charAt(0)}
                      </span>
                    )}

                    {/* 정보 */}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{inf.displayName}</div>
                      <div className="text-[11px] text-dim">{inf.category} · 키워드 {inf.totalKeywords}개</div>
                    </div>

                    {/* 등급 */}
                    <div className="text-center shrink-0">
                      <span className={`font-black font-rank text-lg ${grade.color}`}>{grade.label}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                이전
              </button>
              <span className="text-xs text-dim font-rank">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
