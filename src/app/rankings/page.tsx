'use client';
import { useState, useEffect, useCallback } from 'react';

interface RankedInfluencer {
  rank: number;
  naverId: string;
  displayName: string;
  imageUrl: string;
  category: string;
  categoryMyType: string;
  totalFollowerCount: number;
  subscriberCount: number;
  rank1Count: number;
  top3Count: number;
  top10Count: number;
  integratedCount: number;
  totalKeywords: number;
  score: number;
  firstSeenAt?: string;
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function isNew(dateStr?: string): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

type SortType = 'score' | 'rank1' | 'top3' | 'followers';

export default function RankingsPage() {
  const [rankings, setRankings] = useState<RankedInfluencer[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortType>('score');
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
    { key: 'score', label: '종합점수' },
    { key: 'rank1', label: '1위 키워드' },
    { key: 'top3', label: 'TOP 3' },
    { key: 'followers', label: '팔로워' },
  ];

  const getRankBadge = (rank: number) => {
    if (rank === 1) return 'bg-yellow-500 text-black';
    if (rank === 2) return 'bg-gray-300 text-gray-800';
    if (rank === 3) return 'bg-amber-600 text-white';
    return 'bg-surface text-dim';
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">인플루언서 랭킹</h1>
          <p className="text-xs text-dim mt-0.5">
            키워드 챌린지 종합 순위
            {snapshotDate && ` (${snapshotDate} 기준)`}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-dim font-rank">
            {loading ? '집계 중...' : `총 ${total.toLocaleString()}명`}
          </span>
        </div>
      </div>

      {/* 점수 기준 설명 */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-xs font-bold text-text mb-2">종합 점수 산정 기준</p>
        <div className="flex flex-wrap gap-3 text-[11px] text-dim">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            1위 키워드 x10점
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent" />
            TOP 3 x5점
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-up" />
            통합검색 TOP3 x3점
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-dim" />
            참여 키워드 x1점
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            팔로워 보너스
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
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button key={cat} onClick={() => { setCategory(cat); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
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
          <div className="w-16 h-16 mx-auto rounded-full bg-surface flex items-center justify-center text-2xl font-bold text-dim mb-4">?</div>
          <p className="text-dim text-sm">아직 순위 데이터가 없습니다.</p>
          <p className="text-dim text-xs mt-1">크롤링이 실행되면 자동으로 랭킹이 생성됩니다.</p>
        </div>
      ) : (
        <>
          {/* TOP 3 하이라이트 */}
          {page === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rankings.slice(0, 3).map((inf) => (
                <div key={inf.naverId}
                  className={`relative bg-surface border-2 rounded-xl p-5 text-center ${
                    inf.rank === 1 ? 'border-yellow-500/50 bg-yellow-500/5' :
                    inf.rank === 2 ? 'border-gray-400/50' :
                    'border-amber-600/50'
                  }`}>
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${getRankBadge(inf.rank)}`}>
                    {inf.rank}
                  </div>
                  {inf.imageUrl ? (
                    <img src={inf.imageUrl} alt="" className="w-16 h-16 rounded-full object-cover mx-auto mt-2 mb-2" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xl mx-auto mt-2 mb-2">
                      {inf.displayName.charAt(0)}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5">
                    <a href={`https://in.naver.com/${inf.naverId}`} target="_blank" rel="noopener noreferrer"
                      className="font-bold text-sm hover:text-accent transition-colors">
                      {inf.displayName}
                    </a>
                    {isNew(inf.firstSeenAt) && (
                      <span className="text-[9px] font-bold text-white bg-up px-1 py-0.5 rounded leading-none">NEW</span>
                    )}
                  </div>
                  <p className="text-xs text-dim mt-0.5">{inf.category}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-black text-yellow-500 font-rank">{inf.rank1Count}</div>
                      <div className="text-[10px] text-dim">1위</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-accent font-rank">{inf.top3Count}</div>
                      <div className="text-[10px] text-dim">TOP3</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-text font-rank">{inf.score}</div>
                      <div className="text-[10px] text-dim">점수</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 전체 랭킹 테이블 (Desktop) */}
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs w-12">순위</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">인플루언서</th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs">카테고리</th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs">1위</th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs">TOP3</th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs">통합</th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs">키워드</th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-xs">팔로워</th>
                  <th className="text-right py-3 px-4 font-semibold text-dim text-xs">종합점수</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((inf) => (
                  <tr key={inf.naverId} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${getRankBadge(inf.rank)}`}>
                        {inf.rank}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {inf.imageUrl ? (
                          <img src={inf.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                            {inf.displayName.charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <a href={`https://in.naver.com/${inf.naverId}`} target="_blank" rel="noopener noreferrer"
                              className="font-bold hover:text-accent transition-colors truncate max-w-[160px]">
                              {inf.displayName}
                            </a>
                            {isNew(inf.firstSeenAt) && (
                              <span className="text-[9px] font-bold text-white bg-up px-1 py-0.5 rounded leading-none shrink-0">NEW</span>
                            )}
                          </div>
                          <span className="text-xs text-dim">@{inf.naverId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-dim">{inf.category}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`font-black font-rank text-sm ${inf.rank1Count > 0 ? 'text-yellow-500' : 'text-border'}`}>
                        {inf.rank1Count}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`font-black font-rank text-sm ${inf.top3Count > 0 ? 'text-accent' : 'text-border'}`}>
                        {inf.top3Count}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`font-bold font-rank text-xs ${inf.integratedCount > 0 ? 'text-up' : 'text-border'}`}>
                        {inf.integratedCount}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-xs font-rank text-dim">{inf.totalKeywords}</td>
                    <td className="py-3 px-3 text-right text-xs font-bold font-rank">{formatCount(inf.totalFollowerCount)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-black text-accent font-rank">{inf.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-3">
            {rankings.map((inf) => (
              <div key={inf.naverId}
                className={`bg-surface rounded-xl border p-4 ${
                  inf.rank <= 3 ? 'border-accent/30' : 'border-border'
                }`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${getRankBadge(inf.rank)}`}>
                    {inf.rank}
                  </span>
                  {inf.imageUrl ? (
                    <img src={inf.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {inf.displayName.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <a href={`https://in.naver.com/${inf.naverId}`} target="_blank" rel="noopener noreferrer"
                        className="font-bold text-sm hover:text-accent transition-colors truncate">
                        {inf.displayName}
                      </a>
                      {isNew(inf.firstSeenAt) && (
                        <span className="text-[9px] font-bold text-white bg-up px-1 py-0.5 rounded leading-none shrink-0">NEW</span>
                      )}
                    </div>
                    <span className="text-xs text-dim">{inf.category}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-accent font-rank">{inf.score}</div>
                    <div className="text-[10px] text-dim">점수</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className={`text-sm font-black font-rank ${inf.rank1Count > 0 ? 'text-yellow-500' : 'text-border'}`}>{inf.rank1Count}</div>
                    <div className="text-[10px] text-dim">1위</div>
                  </div>
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className={`text-sm font-black font-rank ${inf.top3Count > 0 ? 'text-accent' : 'text-border'}`}>{inf.top3Count}</div>
                    <div className="text-[10px] text-dim">TOP3</div>
                  </div>
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className={`text-sm font-black font-rank ${inf.integratedCount > 0 ? 'text-up' : 'text-border'}`}>{inf.integratedCount}</div>
                    <div className="text-[10px] text-dim">통합</div>
                  </div>
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className="text-sm font-bold font-rank text-dim">{formatCount(inf.totalFollowerCount)}</div>
                    <div className="text-[10px] text-dim">팔로워</div>
                  </div>
                </div>
              </div>
            ))}
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
