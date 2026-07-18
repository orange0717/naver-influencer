'use client';

import { useState, useRef } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';

interface BlogResult {
  rank: number;
  blogName: string;
  blogId: string;
  postId: string;
  title: string;
  snippet: string;
  date: string;
  url: string;
}

type Tab = 'blog' | 'view' | 'influencer';

const TABS: { key: Tab; label: string }[] = [
  { key: 'view', label: '통합검색' },
  { key: 'blog', label: '블로그' },
  { key: 'influencer', label: '인플루언서' },
];

export default function BlogRankingClient() {
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('view');
  const [results, setResults] = useState<Record<Tab, BlogResult[]>>({ view: [], blog: [], influencer: [] });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = keyword.trim();
    if (!q || loading) return;

    setLoading(true);
    setSearched(true);
    setSearchedKeyword(q);

    // 3개 탭 동시 검색
    try {
      const [viewRes, blogRes, infRes] = await Promise.all([
        fetch(`/api/keywords/blog-top?keyword=${encodeURIComponent(q)}&tab=view&count=30`),
        fetch(`/api/keywords/blog-top?keyword=${encodeURIComponent(q)}&tab=blog&count=30`),
        fetch(`/api/keywords/blog-top?keyword=${encodeURIComponent(q)}&tab=influencer&count=30`),
      ]);

      const viewData = viewRes.ok ? await viewRes.json() : { results: [] };
      const blogData = blogRes.ok ? await blogRes.json() : { results: [] };
      const infData = infRes.ok ? await infRes.json() : { results: [] };

      setResults({
        view: viewData.results || [],
        blog: blogData.results || [],
        influencer: infData.results || [],
      });
    } catch {
      setResults({ view: [], blog: [], influencer: [] });
    } finally {
      setLoading(false);
    }
  };

  const currentResults = results[activeTab];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="font-title text-2xl font-extrabold">검색순위</h1>
        <p className="text-sm text-dim mt-1">키워드를 검색하면 네이버 검색 순위를 확인할 수 있습니다</p>
      </div>

      {/* 검색 폼 */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="검색할 키워드를 입력하세요"
            className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 text-sm shrink-0"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              검색중
            </span>
          ) : '검색'}
        </button>
      </form>

      {/* 결과 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-border/20 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : searched ? (
        <>
          {/* 탭 */}
          <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-dim hover:text-text hover:bg-bg'
                }`}
              >
                {tab.label}
                {results[tab.key].length > 0 && (
                  <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'text-white/70' : 'text-dim'}`}>
                    {results[tab.key].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 결과 헤더 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-dim">
              <span className="font-semibold text-text">&quot;{searchedKeyword}&quot;</span> {TABS.find(t => t.key === activeTab)?.label} 결과
            </p>
            <span className="text-xs text-dim">{currentResults.length}개</span>
          </div>

          {currentResults.length === 0 ? (
            <div className="py-12 text-center text-dim text-sm">
              검색 결과가 없습니다.
            </div>
          ) : (
            <GlassCard padding="none">
              {/* 데스크톱 */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-[11px] text-dim">
                      <th className="text-center px-4 py-3 font-semibold w-14">순위</th>
                      <th className="text-left px-3 py-3 font-semibold w-32">블로그</th>
                      <th className="text-left px-3 py-3 font-semibold">포스팅</th>
                      <th className="text-right px-4 py-3 font-semibold w-24">작성일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {currentResults.map(r => (
                      <tr key={`${r.blogId}-${r.postId}-${r.rank}`} className="hover:bg-surface-hover transition">
                        <td className="text-center px-4 py-3">
                          {r.rank <= 3 ? (
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white ${
                              r.rank === 1 ? 'bg-yellow-500' : r.rank === 2 ? 'bg-gray-400' : 'bg-amber-600'
                            }`}>
                              {r.rank}
                            </span>
                          ) : (
                            <span className="text-dim font-semibold">{r.rank}</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <a href={`https://blog.naver.com/${r.blogId}`} target="_blank" rel="noopener noreferrer"
                            className="font-semibold text-sm hover:text-accent transition block truncate max-w-[120px]">
                            {r.blogName || r.blogId}
                          </a>
                          <span className="text-[10px] text-dim">@{r.blogId}</span>
                        </td>
                        <td className="px-3 py-3">
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="hover:text-accent transition block">
                            <span className="font-medium truncate block max-w-[400px]">{r.title || r.blogId}</span>
                            {r.snippet && (
                              <span className="text-[11px] text-dim line-clamp-1 mt-0.5 block">{r.snippet}</span>
                            )}
                          </a>
                        </td>
                        <td className="text-right px-4 py-3 text-xs text-dim shrink-0">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 모바일 */}
              <div className="md:hidden divide-y divide-border/20">
                {currentResults.map(r => (
                  <div key={`${r.blogId}-${r.postId}-${r.rank}`} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 pt-0.5">
                        {r.rank <= 3 ? (
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white ${
                            r.rank === 1 ? 'bg-yellow-500' : r.rank === 2 ? 'bg-gray-400' : 'bg-amber-600'
                          }`}>
                            {r.rank}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-7 text-dim font-semibold text-sm">{r.rank}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="hover:text-accent transition">
                          <span className="font-semibold text-sm line-clamp-2 block">{r.title || r.blogId}</span>
                        </a>
                        <div className="flex items-center gap-2 mt-1">
                          <a href={`https://blog.naver.com/${r.blogId}`} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-accent font-semibold hover:underline">
                            {r.blogName || r.blogId}
                          </a>
                          {r.date && <span className="text-[10px] text-dim">{r.date}</span>}
                        </div>
                        {r.snippet && (
                          <p className="text-[11px] text-dim line-clamp-1 mt-1">{r.snippet}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      ) : null}
    </div>
  );
}
