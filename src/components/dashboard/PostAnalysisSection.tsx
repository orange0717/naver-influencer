'use client';

import { useState, useCallback } from 'react';

interface PostKeyword {
  keyword: string;
  rank: number;
  isTop3: boolean;
}

interface PostData {
  title: string;
  url: string;
  keywords: PostKeyword[];
  bestRank: number;
  date: string;
}

interface SearchRankInfo {
  blogRank: number | null;
  totalChecked: number;
  postTitle: string | null;
  loading: boolean;
}

function getRankBadge(rank: number) {
  if (rank === 1) return { bg: 'bg-down/15', text: 'text-down', border: 'border-down/30', label: '1위' };
  if (rank <= 3) return { bg: 'bg-accent/15', text: 'text-accent', border: 'border-accent/30', label: `${rank}위` };
  if (rank <= 10) return { bg: 'bg-text/10', text: 'text-text', border: 'border-text/20', label: `${rank}위` };
  if (rank <= 30) return { bg: 'bg-border/40', text: 'text-text', border: 'border-border/50', label: `${rank}위` };
  return { bg: 'bg-border/30', text: 'text-dim', border: 'border-border/30', label: `${rank}위` };
}

export default function PostAnalysisSection({
  posts,
  naverId,
  canSearchRank = true,
}: {
  posts: PostData[];
  naverId: string;
  canSearchRank?: boolean;
}) {
  const [searchRanks, setSearchRanks] = useState<Map<string, SearchRankInfo>>(new Map());
  const [checkingAll, setCheckingAll] = useState(false);

  const checkSearchRank = useCallback(async (keyword: string) => {
    setSearchRanks(prev => {
      const next = new Map(prev);
      next.set(keyword, { blogRank: null, totalChecked: 0, postTitle: null, loading: true });
      return next;
    });

    try {
      const res = await fetch(
        `/api/blog/naver-rank?keyword=${encodeURIComponent(keyword)}&blogId=${naverId}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchRanks(prev => {
          const next = new Map(prev);
          next.set(keyword, {
            blogRank: data.blogRank,
            totalChecked: data.totalChecked || 0,
            postTitle: data.postTitle || null,
            loading: false,
          });
          return next;
        });
      } else {
        throw new Error('Failed');
      }
    } catch {
      setSearchRanks(prev => {
        const next = new Map(prev);
        next.set(keyword, { blogRank: null, totalChecked: 0, postTitle: null, loading: false });
        return next;
      });
    }
  }, [naverId]);

  const checkAllRanks = useCallback(async () => {
    setCheckingAll(true);
    const mainKeywords = posts
      .map(p => {
        const sorted = [...p.keywords].sort((a, b) => a.rank - b.rank);
        return sorted[0]?.keyword;
      })
      .filter(Boolean);

    const unique = [...new Set(mainKeywords)];

    for (const kw of unique) {
      if (!searchRanks.has(kw)) {
        await checkSearchRank(kw);
        // 요청 간 딜레이 (rate limit 방지)
        await new Promise(r => setTimeout(r, 500));
      }
    }
    setCheckingAll(false);
  }, [posts, searchRanks, checkSearchRank]);

  if (posts.length === 0) {
    return (
      <div className="bg-surface/50 backdrop-blur-sm rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-bg/30">
          <h3 className="font-bold text-[15px]">내 포스팅 분석</h3>
          <p className="text-[11px] text-dim mt-0.5">메인 키워드별 순위 현황</p>
        </div>
        <div className="text-center py-10 text-dim text-sm">
          <p>아직 노출 중인 포스팅이 없습니다.</p>
          <p className="text-xs mt-1">키워드 챌린지에 참여하면 자동으로 표시됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-2xl border border-border overflow-hidden">
      {/* ─── 헤더 ─── */}
      <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[15px]">내 포스팅 분석</h3>
          <p className="text-[11px] text-dim mt-0.5">메인 키워드별 순위 현황</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-dim font-rank">{posts.length}개 글</span>
          {canSearchRank ? (
            <button
              onClick={checkAllRanks}
              disabled={checkingAll}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-accent/10 text-accent font-bold hover:bg-accent/20 transition disabled:opacity-50 flex items-center gap-1"
            >
              {checkingAll ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border border-accent border-t-transparent rounded-full" />
                  확인 중...
                </>
              ) : (
                '블로그 검색순위 확인'
              )}
            </button>
          ) : (
            <span className="text-[10px] px-2.5 py-1 rounded-lg bg-border/30 text-dim">
              프리미엄
            </span>
          )}
        </div>
      </div>

      {/* ─── 데스크톱 테이블 ─── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-dim">
              <th className="text-left px-5 py-3 font-semibold w-[35%]">제목</th>
              <th className="text-center px-3 py-3 font-semibold">메인 키워드</th>
              <th className="text-center px-3 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  챌린지 순위
                </span>
              </th>
              <th className="text-center px-3 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  블로그 검색
                </span>
              </th>
              <th className="text-center px-3 py-3 font-semibold">키워드</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {posts.map((post, i) => {
              const mainKw = [...post.keywords].sort((a, b) => a.rank - b.rank)[0];
              const otherKws = post.keywords.filter(k => k.keyword !== mainKw?.keyword);
              const searchRank = mainKw ? searchRanks.get(mainKw.keyword) : undefined;
              const challengeBadge = getRankBadge(post.bestRank);

              return (
                <tr key={i} className="hover:bg-surface-hover/50 transition-colors group">
                  {/* 제목 */}
                  <td className="px-5 py-3.5">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sm hover:text-accent transition-colors line-clamp-1 block"
                    >
                      {post.title}
                    </a>
                    {post.date && (
                      <span className="text-[10px] text-dim">
                        {new Date(post.date).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </span>
                    )}
                  </td>

                  {/* 메인 키워드 */}
                  <td className="px-3 py-3.5 text-center">
                    {mainKw && (
                      <a
                        href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(mainKw.keyword)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-bold px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition whitespace-nowrap"
                        title={`"${mainKw.keyword}" 네이버 검색하기`}
                      >
                        {mainKw.keyword}
                      </a>
                    )}
                  </td>

                  {/* 챌린지 순위 */}
                  <td className="px-3 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center justify-center min-w-[44px] font-black font-rank text-sm px-2.5 py-1 rounded-lg border ${challengeBadge.bg} ${challengeBadge.text} ${challengeBadge.border}`}
                    >
                      {challengeBadge.label}
                    </span>
                  </td>

                  {/* 블로그 검색 순위 */}
                  <td className="px-3 py-3.5 text-center">
                    {!canSearchRank ? (
                      <span className="text-[10px] text-dim">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="inline"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </span>
                    ) : searchRank ? (
                      searchRank.loading ? (
                        <span className="inline-flex items-center gap-1 text-xs text-dim">
                          <span className="animate-spin inline-block w-3 h-3 border border-dim border-t-transparent rounded-full" />
                        </span>
                      ) : searchRank.blogRank !== null ? (
                        (() => {
                          const badge = getRankBadge(searchRank.blogRank);
                          return (
                            <span
                              className={`inline-flex items-center justify-center min-w-[44px] font-black font-rank text-sm px-2.5 py-1 rounded-lg border ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {badge.label}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-[11px] text-dim">100위+</span>
                      )
                    ) : (
                      <button
                        onClick={() => mainKw && checkSearchRank(mainKw.keyword)}
                        className="text-[10px] text-dim hover:text-accent transition px-2 py-1 rounded hover:bg-accent/5"
                      >
                        확인
                      </button>
                    )}
                  </td>

                  {/* 키워드 수 */}
                  <td className="px-3 py-3.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-bold font-rank text-sm">{post.keywords.length}</span>
                      {otherKws.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 justify-center max-w-[150px]">
                          {otherKws.slice(0, 2).map((kw, j) => (
                            <span
                              key={j}
                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                kw.rank <= 3 ? 'bg-accent/10 text-accent' : 'bg-border/30 text-dim'
                              }`}
                            >
                              {kw.keyword} {kw.rank}위
                            </span>
                          ))}
                          {otherKws.length > 2 && (
                            <span className="text-[9px] text-dim">+{otherKws.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── 모바일 카드 ─── */}
      <div className="md:hidden divide-y divide-border/20">
        {posts.map((post, i) => {
          const mainKw = [...post.keywords].sort((a, b) => a.rank - b.rank)[0];
          const otherKws = post.keywords.filter(k => k.keyword !== mainKw?.keyword);
          const searchRank = mainKw ? searchRanks.get(mainKw.keyword) : undefined;
          const challengeBadge = getRankBadge(post.bestRank);

          return (
            <div key={i} className="px-5 py-4 space-y-3">
              {/* 제목 + 날짜 */}
              <div>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sm hover:text-accent transition-colors line-clamp-2 block"
                >
                  {post.title}
                </a>
                {post.date && (
                  <span className="text-[10px] text-dim">
                    {new Date(post.date).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </span>
                )}
              </div>

              {/* 메인 키워드 + 순위들 */}
              <div className="flex items-center gap-2 flex-wrap">
                {mainKw && (
                  <a
                    href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(mainKw.keyword)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-accent/10 text-accent"
                  >
                    {mainKw.keyword}
                  </a>
                )}

                {/* 챌린지 순위 */}
                <span
                  className={`text-[11px] font-black font-rank px-2 py-1 rounded-lg border ${challengeBadge.bg} ${challengeBadge.text} ${challengeBadge.border}`}
                >
                  챌린지 {challengeBadge.label}
                </span>

                {/* 블로그 검색 순위 */}
                {searchRank && !searchRank.loading && searchRank.blogRank !== null && (
                  <span
                    className={`text-[11px] font-black font-rank px-2 py-1 rounded-lg border ${getRankBadge(searchRank.blogRank).bg} ${getRankBadge(searchRank.blogRank).text} ${getRankBadge(searchRank.blogRank).border}`}
                  >
                    블로그 {searchRank.blogRank}위
                  </span>
                )}
                {searchRank && searchRank.loading && (
                  <span className="animate-spin inline-block w-3 h-3 border border-dim border-t-transparent rounded-full" />
                )}
              </div>

              {/* 기타 키워드 */}
              {otherKws.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {otherKws.slice(0, 4).map((kw, j) => (
                    <span
                      key={j}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        kw.rank <= 3 ? 'bg-accent/10 text-accent' : 'bg-border/30 text-dim'
                      }`}
                    >
                      {kw.keyword} {kw.rank}위
                    </span>
                  ))}
                  {otherKws.length > 4 && (
                    <span className="text-[10px] text-dim">+{otherKws.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── 검색 순위 요약 (결과가 있을 때) ─── */}
      {searchRanks.size > 0 && (
        <div className="border-t border-border/30 px-5 py-3 bg-bg/30">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="text-dim font-semibold">블로그 검색 결과:</span>
            {(() => {
              const results = Array.from(searchRanks.values()).filter(r => !r.loading);
              const found = results.filter(r => r.blogRank !== null);
              const top10 = found.filter(r => r.blogRank! <= 10);
              const top3 = found.filter(r => r.blogRank! <= 3);
              return (
                <>
                  <span className="text-dim">
                    검색됨 <strong className="text-text font-rank">{found.length}</strong>/{results.length}개
                  </span>
                  {top3.length > 0 && (
                    <span className="text-dim">
                      TOP 3 <strong className="text-accent font-rank">{top3.length}</strong>개
                    </span>
                  )}
                  {top10.length > 0 && (
                    <span className="text-dim">
                      TOP 10 <strong className="text-text font-rank">{top10.length}</strong>개
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
