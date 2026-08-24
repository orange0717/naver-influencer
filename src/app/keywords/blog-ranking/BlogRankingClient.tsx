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
  // 조회 실패 탭. "결과 0건"과 구분하지 않으면 네이버가 응답하지 않은 것을
  // "그 키워드엔 노출된 글이 없다"로 잘못 읽게 된다.
  const [failed, setFailed] = useState<Record<Tab, boolean>>({ view: false, blog: false, influencer: false });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const [searchedAt, setSearchedAt] = useState<Date | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = keyword.trim();
    if (!q || loading) return;

    setLoading(true);
    setSearched(true);
    setSearchedKeyword(q);

    const fetchTab = async (tab: Tab): Promise<{ results: BlogResult[]; failed: boolean }> => {
      try {
        const res = await fetch(`/api/keywords/blog-top?keyword=${encodeURIComponent(q)}&tab=${tab}&count=30`);
        if (!res.ok) return { results: [], failed: true };
        const data = await res.json();
        return { results: data.results || [], failed: false };
      } catch {
        return { results: [], failed: true };
      }
    };

    // 3개 탭 동시 검색 — 한 탭이 실패해도 나머지 결과는 그대로 보여준다.
    const [view, blog, influencer] = await Promise.all([fetchTab('view'), fetchTab('blog'), fetchTab('influencer')]);
    setResults({ view: view.results, blog: blog.results, influencer: influencer.results });
    setFailed({ view: view.failed, blog: blog.failed, influencer: influencer.failed });
    setSearchedAt(new Date());
    setLoading(false);
  };

  const currentResults = results[activeTab];
  const currentFailed = failed[activeTab];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="type-page-title">검색순위</h1>
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
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
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
          <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-1">
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
                {failed[tab.key] ? (
                  <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'text-white/70' : 'text-down'}`} title="확인 실패">
                    !
                  </span>
                ) : results[tab.key].length > 0 && (
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
              {searchedAt && (
                <span className="ml-2 text-xs text-dim/70">
                  {searchedAt.toLocaleString('ko-KR', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 기준
                </span>
              )}
            </p>
            <span className={`text-xs ${currentFailed ? 'text-down' : 'text-dim'}`}>
              {currentFailed ? '확인 실패' : `${currentResults.length}개`}
            </span>
          </div>

          {currentFailed ? (
            <div className="py-12 text-center text-sm space-y-3">
              <p className="text-down font-semibold">검색 순위를 확인하지 못했습니다.</p>
              <p className="text-dim text-xs leading-relaxed">
                네이버 응답을 받지 못했습니다. 결과가 없는 것이 아니라 확인 자체가 되지 않은 상태입니다.<br />
                잠시 후 다시 시도해주세요.
              </p>
              <button
                type="button"
                onClick={() => handleSearch()}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface transition cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : currentResults.length === 0 ? (
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
                              r.rank === 1 ? 'bg-gold' : r.rank === 2 ? 'bg-silver' : 'bg-bronze'
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
                            r.rank === 1 ? 'bg-gold' : r.rank === 2 ? 'bg-silver' : 'bg-bronze'
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
