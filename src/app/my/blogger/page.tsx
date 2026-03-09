'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface KeywordRank {
  keyword: string;
  rank: number | null;
  totalResults: number;
  blogUrl: string;
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

export default function BloggerDashboard() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [keyword, setKeyword] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [results, setResults] = useState<KeywordRank[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState('');

  useEffect(() => {
    const p = getProfileFromCookies();
    if (!p) {
      window.location.href = '/auth/login';
      return;
    }
    setProfile(p);

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
          const filtered = prev.filter(r => r.keyword !== kw);
          const updated = [...filtered, {
            keyword: kw,
            rank: data.rank,
            totalResults: data.totalResults || 0,
            blogUrl: data.blogUrl || '',
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
    for (const kw of keywords) {
      await checkRank(kw);
      // 요청 간 딜레이
      await new Promise(r => setTimeout(r, 1500));
    }
    setLoading(false);
  };

  // 결과 맵
  const resultMap = new Map(results.map(r => [r.keyword, r]));

  // 통계
  const rankedCount = results.filter(r => r.rank !== null).length;
  const top10Count = results.filter(r => r.rank !== null && r.rank <= 10).length;
  const top30Count = results.filter(r => r.rank !== null && r.rank <= 30).length;
  const avgRank = rankedCount > 0
    ? results.filter(r => r.rank !== null).reduce((s, r) => s + (r.rank || 0), 0) / rankedCount
    : 0;

  if (!profile) return null;

  return (
    <div className="space-y-8">
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
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <a href={`https://blog.naver.com/${profile.blogId}`} target="_blank" rel="noopener noreferrer"
                className="text-sm text-dim hover:text-accent transition">
                blog.naver.com/{profile.blogId}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 통계 카드 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">평균 순위</p>
          <p className={`text-2xl font-black font-rank ${avgRank > 0 ? 'text-accent' : 'text-dim'}`}>
            {avgRank > 0 ? `${Math.round(avgRank)}위` : '—'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">등록 키워드</p>
          <p className="text-2xl font-black font-rank">{keywords.length}개</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">TOP 10</p>
          <p className={`text-2xl font-black font-rank ${top10Count > 0 ? 'text-up' : 'text-dim'}`}>{top10Count}개</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">TOP 30</p>
          <p className={`text-2xl font-black font-rank ${top30Count > 0 ? 'text-[#2DB400]' : 'text-dim'}`}>{top30Count}개</p>
        </div>
      </div>

      {/* ─── 키워드 추가 ─── */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-4">키워드 등록</h3>
        <p className="text-xs text-dim mb-3">
          순위를 확인하고 싶은 키워드를 등록하세요. 네이버 블로그탭에서 내 블로그 순위를 확인합니다.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="키워드 입력 (예: 맛집추천, 여행코스)"
            className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
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
          <div className="flex flex-wrap gap-2 mt-4">
            {keywords.map(kw => (
              <span key={kw} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-full text-sm">
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  className="text-dim hover:text-down transition cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l6 6M10 4l-6 6"/></svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {keywords.length > 0 && (
          <button
            onClick={checkAllRanks}
            disabled={loading}
            className="mt-4 px-6 py-2.5 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                순위 확인 중...
              </span>
            ) : `전체 순위 확인 (${keywords.length}개)`}
          </button>
        )}
      </div>

      {/* ─── 순위 결과 ─── */}
      {keywords.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-bg/50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">블로그탭 키워드 순위</h3>
              <p className="text-[11px] text-dim mt-0.5">네이버 검색 → 블로그 탭 기준</p>
            </div>
            {results.length > 0 && (
              <span className="text-xs text-dim">
                마지막 확인: {new Date(results[results.length - 1]?.checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </span>
            )}
          </div>

          {/* 데스크톱 테이블 */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-dim">
                  <th className="text-left px-5 py-3 font-semibold">키워드</th>
                  <th className="text-center px-3 py-3 font-semibold">블로그탭 순위</th>
                  <th className="text-center px-3 py-3 font-semibold">상태</th>
                  <th className="text-right px-5 py-3 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {keywords.map(kw => {
                  const result = resultMap.get(kw);
                  return (
                    <tr key={kw} className="hover:bg-surface-hover transition">
                      <td className="px-5 py-3.5 font-semibold">{kw}</td>
                      <td className="text-center px-3 py-3.5">
                        {result ? (
                          result.rank !== null ? (
                            <span className={`font-black font-rank ${
                              result.rank <= 3 ? 'text-accent' : result.rank <= 10 ? 'text-up' : result.rank <= 30 ? 'text-[#2DB400]' : 'text-dim'
                            }`}>
                              {result.rank}위
                            </span>
                          ) : (
                            <span className="text-dim">순위권 밖</span>
                          )
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {result && result.rank !== null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            result.rank <= 10 ? 'bg-up/10 text-up' : result.rank <= 30 ? 'bg-[#2DB400]/10 text-[#2DB400]' : 'bg-border/30 text-dim'
                          }`}>
                            {result.rank <= 10 ? 'TOP 10' : result.rank <= 30 ? 'TOP 30' : `${result.rank}위`}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-5 py-3.5">
                        <button
                          onClick={() => checkRank(kw)}
                          disabled={checking === kw || loading}
                          className="text-xs text-accent hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {checking === kw ? '확인 중...' : '순위 확인'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-border/20">
            {keywords.map(kw => {
              const result = resultMap.get(kw);
              return (
                <div key={kw} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm block">{kw}</span>
                    {result && result.rank !== null && (
                      <span className={`text-xs ${
                        result.rank <= 10 ? 'text-up' : result.rank <= 30 ? 'text-[#2DB400]' : 'text-dim'
                      }`}>
                        블로그탭 {result.rank}위
                      </span>
                    )}
                    {result && result.rank === null && (
                      <span className="text-xs text-dim">순위권 밖</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {result && result.rank !== null && (
                      <span className={`text-lg font-black font-rank ${
                        result.rank <= 3 ? 'text-accent' : result.rank <= 10 ? 'text-up' : 'text-dim'
                      }`}>
                        {result.rank}위
                      </span>
                    )}
                    <button
                      onClick={() => checkRank(kw)}
                      disabled={checking === kw || loading}
                      className="text-xs text-accent cursor-pointer disabled:opacity-50"
                    >
                      {checking === kw ? '...' : '확인'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 가이드 ─── */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">블로그 순위 올리는 팁</h3>
        <div className="space-y-3 text-sm text-dim">
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">C</span>
            <div>
              <p className="font-semibold text-text">C-Rank (블로그 신뢰도)</p>
              <p className="text-xs mt-0.5">한 가지 주제에 집중하여 전문성 쌓기, 꾸준한 포스팅</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-up/10 flex items-center justify-center text-up text-xs font-bold">D</span>
            <div>
              <p className="font-semibold text-text">DIA (문서 선호도)</p>
              <p className="text-xs mt-0.5">독창적 콘텐츠, 실제 경험 기반 리뷰, 체류시간 증가</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-[#7B1FA2]/10 flex items-center justify-center text-[#7B1FA2] text-xs font-bold">D+</span>
            <div>
              <p className="font-semibold text-text">DIA+ (검색의도 부합)</p>
              <p className="text-xs mt-0.5">검색자의 질문에 답하는 구조, 초반에 핵심 정보 배치</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 인플루언서 전환 안내 ─── */}
      <div className="bg-accent/5 rounded-xl border border-accent/20 p-5 text-center">
        <p className="text-sm font-semibold mb-1">네이버 인플루언서이신가요?</p>
        <p className="text-xs text-dim mb-3">인플루언서 전용 대시보드에서 키워드챌린지 순위, 경쟁 분석 등을 확인하세요.</p>
        <Link href="/auth/login" className="text-sm text-accent font-bold hover:underline">
          인플루언서로 로그인 →
        </Link>
      </div>
    </div>
  );
}
