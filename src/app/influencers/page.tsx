'use client';
import { useState, useEffect, useCallback } from 'react';
import Banner from '@/components/Banner';
import { PARTNER_BANNERS } from '@/lib/banner-data';

interface InfluencerItem {
  name: string;
  naverId: string;
  profileUrl: string;
  imageUrl: string;
  introduction: string;
  subscriberCount: number;
  totalFollowerCount: number;
  myKeywordCategory: string;
  myKeyword: string;
  categoryMyType: string;
  foundInKeywords: string[];
  firstSeenAt?: string;
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      });
      if (category !== '전체') params.set('category', category);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/influencers?${params}`);
      const data = await res.json();

      setInfluencers(data.influencers || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('인플루언서 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [page, category, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, search ? 500 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">인플루언서(구. 파워블로거 2016년 폐지) 목록</h1>
          <p className="text-xs text-dim mt-0.5">키워드 챌린지 참여 인플루언서</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-dim font-rank">
            {loading ? '수집 중...' : `총 ${total.toLocaleString()}명`}
          </span>
          {!loading && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-600 font-bold">LIVE</span>
            </div>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="인플루언서 검색 (이름, 카테고리, 키워드, 유형)..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
      />

      <div className="flex flex-wrap gap-2 items-center">
        {categories.map(cat => (
          <button key={cat} onClick={() => handleCategoryChange(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              category === cat ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:border-accent/40'
            }`}>{cat}</button>
        ))}
      </div>

      {/* 협력사 배너 */}
      <Banner banner={PARTNER_BANNERS[0]} dismissKey="influencers-partner" />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">인플루언서 데이터를 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs w-8">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">인플루언서</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">활동 분야</th>
                  <th className="text-right py-3 px-4 font-semibold text-dim text-xs">구독자</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">선정일</th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((inf, i) => (
                  <tr key={inf.naverId || inf.name + i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-bold text-dim font-rank text-xs">{(page - 1) * 50 + i + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {inf.imageUrl ? (
                          <img src={inf.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                            {inf.name.charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <a href={inf.profileUrl} target="_blank" rel="noopener noreferrer"
                              className="font-bold hover:text-accent transition-colors truncate max-w-[180px]">
                              {inf.name}
                            </a>
                          </div>
                          <span className="text-xs text-dim">@{inf.naverId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs">
                        <span className="font-semibold text-text">{inf.myKeywordCategory || '-'}</span>
                        {inf.categoryMyType && (
                          <span className="text-dim ml-1">· {inf.categoryMyType}</span>
                        )}
                      </div>
                      {inf.myKeyword && (
                        <div className="text-[10px] text-dim mt-0.5">{inf.myKeyword}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-bold font-rank text-accent">
                      {formatCount(inf.subscriberCount)}
                    </td>
                    <td className="py-3 px-4 text-xs text-dim">
                      {formatDate(inf.firstSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {influencers.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {influencers.map((inf, i) => (
              <div key={inf.naverId || inf.name + i}
                className="bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
                <div className="flex items-center gap-3 mb-2">
                  {inf.imageUrl ? (
                    <img src={inf.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {inf.name.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <a href={inf.profileUrl} target="_blank" rel="noopener noreferrer"
                        className="font-bold text-sm hover:text-accent transition-colors truncate">
                        {inf.name}
                      </a>
                    </div>
                    <span className="text-xs text-dim">@{inf.naverId}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-accent font-rank">{formatCount(inf.subscriberCount)}</div>
                    <div className="text-[10px] text-dim">구독자</div>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-dim truncate">
                    {inf.myKeywordCategory}{inf.categoryMyType ? ` · ${inf.categoryMyType}` : ''}
                  </div>
                </div>
                {inf.firstSeenAt && (
                  <div className="text-[10px] text-dim">
                    선정일 {formatDate(inf.firstSeenAt)}
                  </div>
                )}
              </div>
            ))}
            {influencers.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>
            )}
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
