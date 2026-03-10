'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const ADMIN_BLOG_IDS = ['orangelibrary'];

interface KeywordRank {
  keyword: string;
  rank: number | null;
  prevRank: number | null;
  totalResults: number;
  blogUrl: string;
  postTitle: string;
  searchUrl: string;
  checkedAt: string;
}

interface BloggerProfile {
  blogId: string;
  displayName: string;
}

function getProfileFromCookies(): BloggerProfile | null {
  const cookies = document.cookie;
  const blogMatch = cookies.match(/(?:^|;\s*)blog_id=([^;]*)/);
  const nameMatch = cookies.match(/(?:^|;\s*)blog_name=([^;]*)/);

  if (!blogMatch) return null;

  return {
    blogId: decodeURIComponent(blogMatch[1]),
    displayName: nameMatch ? decodeURIComponent(nameMatch[1]) : decodeURIComponent(blogMatch[1]),
  };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="text-xs text-dim bg-border/30 px-2 py-0.5 rounded-full">미노출</span>;
  if (rank <= 5) return <span className="text-xs font-bold text-white bg-accent px-2 py-0.5 rounded-full">TOP 5</span>;
  if (rank <= 10) return <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">TOP 10</span>;
  if (rank <= 20) return <span className="text-xs font-bold text-[#2DB400] bg-[#2DB400]/10 px-2 py-0.5 rounded-full">TOP 20</span>;
  if (rank <= 30) return <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">TOP 30</span>;
  return <span className="text-xs text-dim bg-border/30 px-2 py-0.5 rounded-full">{rank}위</span>;
}

function RankChange({ current, prev }: { current: number | null; prev: number | null }) {
  if (current === null || prev === null) return null;
  const diff = prev - current; // 양수면 순위 상승
  if (diff === 0) return <span className="text-xs text-dim">—</span>;
  if (diff > 0) return <span className="text-xs text-up font-bold flex items-center gap-0.5">▲{diff}</span>;
  return <span className="text-xs text-down font-bold flex items-center gap-0.5">▼{Math.abs(diff)}</span>;
}

export default function BloggerDashboard() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [keyword, setKeyword] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [results, setResults] = useState<KeywordRank[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const p = getProfileFromCookies();
    if (!p) {
      window.location.href = '/auth/login';
      return;
    }
    setProfile(p);

    // 관리자 체크
    if (ADMIN_BLOG_IDS.includes(p.blogId)) {
      setIsSubscribed(true);
    } else {
      // 구독 상태 확인
      fetch(`/api/blog/subscription?blogId=${encodeURIComponent(p.blogId)}`)
        .then(res => res.json())
        .then(data => setIsSubscribed(data.subscribed === true))
        .catch(() => setIsSubscribed(false));
    }

    // 저장된 키워드 불러오기
    const saved = localStorage.getItem(`blogger_keywords_${p.blogId}`);
    if (saved) {
      try { setKeywords(JSON.parse(saved)); } catch { /* ignore */ }
    }
    const savedResults = localStorage.getItem(`blogger_results_${p.blogId}`);
    if (savedResults) {
      try { setResults(JSON.parse(savedResults)); } catch { /* ignore */ }
    }
  }, []);

  // 키워드 저장
  const saveKeywords = useCallback((kws: string[]) => {
    if (!profile) return;
    localStorage.setItem(`blogger_keywords_${profile.blogId}`, JSON.stringify(kws));
  }, [profile]);

  const saveResults = useCallback((res: KeywordRank[]) => {
    if (!profile) return;
    localStorage.setItem(`blogger_results_${profile.blogId}`, JSON.stringify(res));
  }, [profile]);

  const addKeyword = () => {
    const kw = keyword.trim();
    if (!kw || keywords.includes(kw)) return;
    if (keywords.length >= 20) {
      alert('키워드는 최대 20개까지 등록할 수 있습니다.');
      return;
    }
    const updated = [...keywords, kw];
    setKeywords(updated);
    saveKeywords(updated);
    setKeyword('');
  };

  const removeKeyword = (kw: string) => {
    const updated = keywords.filter(k => k !== kw);
    setKeywords(updated);
    saveKeywords(updated);
    setResults(prev => {
      const filtered = prev.filter(r => r.keyword !== kw);
      saveResults(filtered);
      return filtered;
    });
  };

  const checkRank = async (kw: string) => {
    if (!profile) return;
    setChecking(kw);
    try {
      const res = await fetch(`/api/blog/rank?keyword=${encodeURIComponent(kw)}&blogId=${encodeURIComponent(profile.blogId)}`);
      const data = await res.json();
      if (res.ok) {
        setResults(prev => {
          const existing = prev.find(r => r.keyword === kw);
          const filtered = prev.filter(r => r.keyword !== kw);
          const updated = [...filtered, {
            keyword: kw,
            rank: data.rank,
            prevRank: existing?.rank ?? null,
            totalResults: data.totalResults || 0,
            blogUrl: data.blogUrl || '',
            postTitle: data.postTitle || '',
            searchUrl: data.searchUrl || '',
            checkedAt: new Date().toISOString(),
          }];
          saveResults(updated);
          return updated;
        });
      }
    } catch {
      // 에러 무시
    } finally {
      setChecking('');
    }
  };

  const checkAllRanks = async () => {
    if (!profile || keywords.length === 0) return;
    setLoading(true);
    setCheckProgress({ current: 0, total: keywords.length });
    for (let i = 0; i < keywords.length; i++) {
      setCheckProgress({ current: i + 1, total: keywords.length });
      await checkRank(keywords[i]);
      // 요청 간 딜레이
      if (i < keywords.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    setLoading(false);
    setCheckProgress({ current: 0, total: 0 });
  };

  // 결과 맵 (키워드 순서 유지)
  const resultMap = new Map(results.map(r => [r.keyword, r]));

  // 통계
  const checkedResults = results.filter(r => keywords.includes(r.keyword));
  const rankedCount = checkedResults.filter(r => r.rank !== null).length;
  const top5Count = checkedResults.filter(r => r.rank !== null && r.rank <= 5).length;
  const top10Count = checkedResults.filter(r => r.rank !== null && r.rank <= 10).length;
  const avgRank = rankedCount > 0
    ? checkedResults.filter(r => r.rank !== null).reduce((s, r) => s + (r.rank || 0), 0) / rankedCount
    : 0;
  // 순위 상승/하락 키워드 수
  const improvedCount = checkedResults.filter(r => r.rank !== null && r.prevRank !== null && r.rank < r.prevRank).length;
  const declinedCount = checkedResults.filter(r => r.rank !== null && r.prevRank !== null && r.rank > r.prevRank).length;

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* ─── 프로필 헤더 ─── */}
      <div className="bg-surface rounded-2xl border border-border p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#2DB400]/15 rounded-full flex items-center justify-center text-[#2DB400] text-2xl font-bold">
            {profile.displayName[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold">{profile.displayName}</h1>
              <span className="text-[10px] text-[#2DB400] bg-[#2DB400]/10 px-2 py-0.5 rounded-full font-semibold">블로거</span>
              {isSubscribed && (
                <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-semibold">구독중</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <a href={`https://blog.naver.com/${profile.blogId}`} target="_blank" rel="noopener noreferrer"
                className="text-sm text-dim hover:text-accent transition">
                blog.naver.com/{profile.blogId}
              </a>
              <span className="text-xs text-dim">|</span>
              <span className="text-xs text-dim">등록 키워드 {keywords.length}개</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 대시보드 콘텐츠 (미구독 시 블라인드) ─── */}
      <div className="relative">

      {/* 미구독 시 블라인드 오버레이 */}
      {!isSubscribed && (
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-32">
          <div className="bg-surface/95 backdrop-blur-sm rounded-2xl border border-[#2DB400]/20 p-8 text-center space-y-4 shadow-xl max-w-sm mx-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#2DB400]/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[#2DB400]"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 className="text-lg font-extrabold text-text">구독하고 대시보드 이용하기</h2>
            <p className="text-sm text-dim leading-relaxed">
              블로그탭 키워드 순위 추적, 순위 변동 분석 등<br />
              대시보드의 모든 기능을 이용하세요.
            </p>
            <div className="flex flex-col items-center gap-2 pt-2">
              <Link href="/subscribe" className="px-8 py-3 bg-[#2DB400] text-white font-bold rounded-xl hover:bg-[#25a000] transition text-sm">
                월 9,900원으로 구독하기
              </Link>
              <p className="text-[11px] text-dim">검색량 조회와 랭킹은 무료입니다</p>
            </div>
          </div>
        </div>
      )}

      <div className={`space-y-6 ${!isSubscribed ? 'blur-[6px] select-none pointer-events-none' : ''}`}>

      {/* ─── 통계 카드 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1.5">평균 순위</p>
          <p className={`text-2xl font-black font-rank ${avgRank > 0 ? 'text-accent' : 'text-dim'}`}>
            {avgRank > 0 ? `${Math.round(avgRank)}위` : '—'}
          </p>
          {rankedCount > 0 && (
            <p className="text-[11px] text-dim mt-1">{rankedCount}개 키워드 노출 중</p>
          )}
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1.5">TOP 5 / TOP 10</p>
          <div className="flex items-baseline gap-1.5">
            <p className={`text-2xl font-black font-rank ${top5Count > 0 ? 'text-accent' : 'text-dim'}`}>{top5Count}</p>
            <span className="text-dim text-sm">/</span>
            <p className={`text-xl font-black font-rank ${top10Count > 0 ? 'text-up' : 'text-dim'}`}>{top10Count}</p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1.5">순위 상승</p>
          <p className={`text-2xl font-black font-rank ${improvedCount > 0 ? 'text-up' : 'text-dim'}`}>
            {improvedCount > 0 ? `${improvedCount}개 ▲` : '—'}
          </p>
          {declinedCount > 0 && (
            <p className="text-[11px] text-down mt-1">{declinedCount}개 하락</p>
          )}
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1.5">등록 키워드</p>
          <p className="text-2xl font-black font-rank">{keywords.length}<span className="text-sm text-dim font-normal">/20</span></p>
        </div>
      </div>

      {/* ─── 키워드 등록 ─── */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm">키워드 등록</h3>
            <p className="text-[11px] text-dim mt-0.5">
              내 블로그 순위를 확인할 키워드를 등록하세요 (최대 20개)
            </p>
          </div>
          {keywords.length > 0 && (
            <button
              onClick={checkAllRanks}
              disabled={loading}
              className="px-4 py-2 bg-accent text-white font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {checkProgress.current}/{checkProgress.total}
                </span>
              ) : `전체 확인`}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="키워드 입력 (예: 맛집추천, 여행코스)"
            className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-[#2DB400] focus:ring-1 focus:ring-[#2DB400]/30 transition"
          />
          <button
            onClick={addKeyword}
            disabled={!keyword.trim()}
            className="px-5 py-2.5 bg-[#2DB400] text-white font-bold rounded-xl hover:bg-[#25a000] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0"
          >
            추가
          </button>
        </div>

        {/* 등록된 키워드 태그 */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {keywords.map(kw => {
              const result = resultMap.get(kw);
              return (
                <span key={kw} className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-sm ${
                  result?.rank !== null && result?.rank !== undefined
                    ? result.rank <= 10 ? 'bg-up/5 border-up/20' : 'bg-bg border-border'
                    : 'bg-bg border-border'
                }`}>
                  {kw}
                  {result?.rank !== null && result?.rank !== undefined && (
                    <span className={`text-[10px] font-bold ${
                      result.rank <= 5 ? 'text-accent' : result.rank <= 10 ? 'text-up' : 'text-dim'
                    }`}>{result.rank}위</span>
                  )}
                  <button
                    onClick={() => removeKeyword(kw)}
                    className="text-dim hover:text-down transition cursor-pointer ml-0.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l6 6M10 4l-6 6"/></svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 순위 결과 ─── */}
      {keywords.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-bg/50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">블로그탭 키워드 순위</h3>
              <p className="text-[11px] text-dim mt-0.5">네이버 검색 → 블로그 탭 기준 (TOP 30까지 확인)</p>
            </div>
            {checkedResults.length > 0 && (
              <span className="text-[11px] text-dim">
                {timeAgo(checkedResults[checkedResults.length - 1]?.checkedAt)}
              </span>
            )}
          </div>

          {/* 데스크톱 테이블 */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-[11px] text-dim">
                  <th className="text-left px-5 py-3 font-semibold w-10">#</th>
                  <th className="text-left px-3 py-3 font-semibold">키워드</th>
                  <th className="text-center px-3 py-3 font-semibold">순위</th>
                  <th className="text-center px-3 py-3 font-semibold">변동</th>
                  <th className="text-left px-3 py-3 font-semibold">노출 글</th>
                  <th className="text-center px-3 py-3 font-semibold">확인</th>
                  <th className="text-right px-5 py-3 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {keywords.map((kw, i) => {
                  const result = resultMap.get(kw);
                  return (
                    <tr key={kw} className="hover:bg-surface-hover transition group">
                      <td className="px-5 py-3.5 text-dim text-xs">{i + 1}</td>
                      <td className="px-3 py-3.5">
                        <a
                          href={result?.searchUrl || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="font-semibold hover:text-accent transition"
                        >
                          {kw}
                        </a>
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {result ? (
                          result.rank !== null ? (
                            <span className={`font-black font-rank text-base ${
                              result.rank <= 3 ? 'text-accent' : result.rank <= 5 ? 'text-orange-500' : result.rank <= 10 ? 'text-up' : result.rank <= 20 ? 'text-[#2DB400]' : 'text-dim'
                            }`}>
                              {result.rank}위
                            </span>
                          ) : (
                            <span className="text-dim text-xs">30위 밖</span>
                          )
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        <RankChange current={result?.rank ?? null} prev={result?.prevRank ?? null} />
                      </td>
                      <td className="px-3 py-3.5">
                        {result?.postTitle && result.rank !== null ? (
                          <a
                            href={result.blogUrl}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-dim hover:text-accent transition truncate block max-w-[200px]"
                            title={result.postTitle}
                          >
                            {result.postTitle}
                          </a>
                        ) : (
                          <span className="text-xs text-dim">—</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {result && (
                          <span className="text-[10px] text-dim">{timeAgo(result.checkedAt)}</span>
                        )}
                      </td>
                      <td className="text-right px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <RankBadge rank={result?.rank ?? null} />
                          <button
                            onClick={() => checkRank(kw)}
                            disabled={checking === kw || loading}
                            className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition"
                          >
                            {checking === kw ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : '확인'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-border/20">
            {keywords.map((kw, i) => {
              const result = resultMap.get(kw);
              return (
                <div key={kw} className="px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] text-dim w-5 shrink-0">{i + 1}</span>
                      <a
                        href={result?.searchUrl || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-sm truncate"
                      >
                        {kw}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {result?.rank !== null && result?.rank !== undefined ? (
                        <span className={`text-lg font-black font-rank ${
                          result.rank <= 3 ? 'text-accent' : result.rank <= 10 ? 'text-up' : 'text-dim'
                        }`}>
                          {result.rank}위
                        </span>
                      ) : result ? (
                        <span className="text-xs text-dim">30위 밖</span>
                      ) : null}
                      <RankChange current={result?.rank ?? null} prev={result?.prevRank ?? null} />
                      <button
                        onClick={() => checkRank(kw)}
                        disabled={checking === kw || loading}
                        className="text-xs text-accent cursor-pointer disabled:opacity-50 pl-1"
                      >
                        {checking === kw ? (
                          <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                        ) : '확인'}
                      </button>
                    </div>
                  </div>
                  {result?.postTitle && result.rank !== null && (
                    <div className="mt-1 ml-7">
                      <a href={result.blogUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-dim hover:text-accent transition truncate block">
                        {result.postTitle}
                      </a>
                    </div>
                  )}
                  {result && (
                    <div className="mt-1 ml-7 flex items-center gap-2">
                      <RankBadge rank={result.rank} />
                      <span className="text-[10px] text-dim">{timeAgo(result.checkedAt)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 빈 상태 ─── */}
      {keywords.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#2DB400]/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#2DB400]">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </div>
          <h3 className="font-bold text-base mb-2">키워드를 등록해보세요</h3>
          <p className="text-sm text-dim leading-relaxed max-w-md mx-auto">
            내 블로그가 네이버 블로그탭에서 몇 위에 노출되는지<br />
            키워드별로 추적할 수 있습니다.
          </p>
        </div>
      )}

      {/* ─── 가이드 ─── */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">블로그 순위 올리는 팁</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex gap-3 p-3 bg-bg rounded-lg">
            <span className="shrink-0 w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">C</span>
            <div>
              <p className="font-semibold text-sm text-text">C-Rank</p>
              <p className="text-[11px] text-dim mt-0.5">한 분야 전문성 + 꾸준한 포스팅</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 bg-bg rounded-lg">
            <span className="shrink-0 w-8 h-8 rounded-full bg-up/10 flex items-center justify-center text-up text-xs font-bold">D</span>
            <div>
              <p className="font-semibold text-sm text-text">DIA</p>
              <p className="text-[11px] text-dim mt-0.5">독창적 콘텐츠 + 체류시간</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 bg-bg rounded-lg">
            <span className="shrink-0 w-8 h-8 rounded-full bg-[#7B1FA2]/10 flex items-center justify-center text-[#7B1FA2] text-xs font-bold">D+</span>
            <div>
              <p className="font-semibold text-sm text-text">DIA+</p>
              <p className="text-[11px] text-dim mt-0.5">검색 의도 부합 + 핵심 배치</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 무료 기능 안내 ─── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/search-volume" className="bg-surface rounded-xl border border-border p-5 hover:border-accent/30 transition group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </div>
            <div>
              <p className="font-bold text-sm">검색량 조회</p>
              <p className="text-[11px] text-dim mt-0.5">키워드 월간 검색량 무료 확인</p>
            </div>
          </div>
        </Link>
        <Link href="/rankings" className="bg-surface rounded-xl border border-border p-5 hover:border-accent/30 transition group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M6 20V4M18 20v-6"/></svg>
            </div>
            <div>
              <p className="font-bold text-sm">인플루언서 랭킹</p>
              <p className="text-[11px] text-dim mt-0.5">카테고리별 인플루언서 순위</p>
            </div>
          </div>
        </Link>
      </div>

      {/* ─── 인플루언서 전환 안내 ─── */}
      <div className="bg-accent/5 rounded-xl border border-accent/20 p-5 text-center">
        <p className="text-sm font-semibold mb-1">네이버 인플루언서이신가요?</p>
        <p className="text-xs text-dim mb-3">인플루언서 전용 대시보드에서 키워드챌린지 순위, 경쟁 분석 등을 확인하세요.</p>
        <Link href="/auth/login" className="text-sm text-accent font-bold hover:underline">
          인플루언서로 로그인 →
        </Link>
      </div>

      </div>{/* /blur wrapper */}
      </div>{/* /relative wrapper */}
    </div>
  );
}
