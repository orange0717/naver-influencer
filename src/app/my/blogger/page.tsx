'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GradeGauge from '@/components/dashboard/GradeGauge';
import RankTrendSection from '@/components/dashboard/RankTrendSection';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import GlassCard from '@/components/dashboard/GlassCard';
import { generateBloggerEvents } from '@/lib/activity-events';

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
  isInfluencer: boolean;
  imageUrl?: string;
}

interface ExtractedKeyword {
  keyword: string;
  frequency: number;
  postCount: number;
  score: number;
}

interface KeywordHistory {
  keyword_id: string;
  keyword: string;
  history: { date: string; rank: number | null }[];
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  viewCount: number;
  date: string;
  isPublic: boolean;
}

async function getProfileFromApi(): Promise<BloggerProfile | null> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.type === 'blogger' && data.id) {
      return { blogId: data.id, displayName: data.name || data.id, isInfluencer: false };
    }
    if (data.type === 'influencer' && data.id) {
      return { blogId: data.id, displayName: data.name || data.id, isInfluencer: true };
    }
    return null;
  } catch {
    return null;
  }
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

function RankBadge({ rank, checked = true }: { rank: number | null; checked?: boolean }) {
  if (!checked) return <span className="text-xs text-dim bg-border/30 px-2 py-0.5 rounded-full">확인 전</span>;
  if (rank === null) return <span className="text-xs text-down/80 bg-down/10 px-2 py-0.5 rounded-full">미노출</span>;
  if (rank <= 5) return <span className="text-xs font-bold text-white bg-accent px-2 py-0.5 rounded-full">TOP 5</span>;
  if (rank <= 10) return <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">TOP 10</span>;
  if (rank <= 20) return <span className="text-xs font-bold text-[#2DB400] bg-[#2DB400]/10 px-2 py-0.5 rounded-full">TOP 20</span>;
  if (rank <= 30) return <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">TOP 30</span>;
  return <span className="text-xs text-dim bg-border/30 px-2 py-0.5 rounded-full">{rank}위</span>;
}

function RankChange({ current, prev }: { current: number | null; prev: number | null }) {
  if (current === null || prev === null) return null;
  const diff = prev - current;
  if (diff === 0) return <span className="text-xs text-dim">—</span>;
  if (diff > 0) return <span className="text-xs text-up font-bold">▲{diff}</span>;
  return <span className="text-xs text-down font-bold">▼{Math.abs(diff)}</span>;
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
  const [extractedKeywords, setExtractedKeywords] = useState<ExtractedKeyword[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [rankHistory, setRankHistory] = useState<KeywordHistory[]>([]);
  const [customProfile, setCustomProfile] = useState<{ displayName?: string; imageUrl?: string }>({});
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [blogPostsPage, setBlogPostsPage] = useState(1);
  const [blogPostsLoading, setBlogPostsLoading] = useState(false);

  // 미확인 키워드 자동 순위 확인
  const autoCheckRef = useRef(false);
  const autoCheckUnchecked = useCallback(async (kws: string[], savedRes: KeywordRank[], blogProfile: BloggerProfile) => {
    if (autoCheckRef.current) return;
    const checkedKeywords = new Set(savedRes.map(r => r.keyword));
    // 1시간 이상 지난 결과도 재확인
    const staleThreshold = Date.now() - 60 * 60 * 1000;
    const staleKeywords = savedRes
      .filter(r => kws.includes(r.keyword) && new Date(r.checkedAt).getTime() < staleThreshold)
      .map(r => r.keyword);
    const unchecked = kws.filter(kw => !checkedKeywords.has(kw));
    const toCheck = [...new Set([...unchecked, ...staleKeywords])];
    if (toCheck.length === 0) return;
    autoCheckRef.current = true;
    setLoading(true);
    setCheckProgress({ current: 0, total: toCheck.length });
    for (let i = 0; i < toCheck.length; i++) {
      setCheckProgress({ current: i + 1, total: toCheck.length });
      try {
        const res = await fetch(`/api/blog/rank?keyword=${encodeURIComponent(toCheck[i])}&blogId=${encodeURIComponent(blogProfile.blogId)}`);
        const data = await res.json();
        if (res.ok) {
          setResults(prev => {
            const existing = prev.find(r => r.keyword === toCheck[i]);
            const filtered = prev.filter(r => r.keyword !== toCheck[i]);
            const updated = [...filtered, {
              keyword: toCheck[i], rank: data.rank, prevRank: existing?.rank ?? null,
              totalResults: data.totalResults || 0, blogUrl: data.blogUrl || '',
              postTitle: data.postTitle || '', searchUrl: data.searchUrl || '',
              checkedAt: new Date().toISOString(),
            }];
            if (blogProfile) localStorage.setItem(`blogger_results_${blogProfile.blogId}`, JSON.stringify(updated));
            return updated;
          });
        }
      } catch { /* ignore */ }
      if (i < toCheck.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setLoading(false);
    setCheckProgress({ current: 0, total: 0 });
    autoCheckRef.current = false;
  }, []);

  const fetchBlogPosts = useCallback(async (blogId: string, page: number = 1) => {
    setBlogPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=10`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
        setBlogPostsTotal(data.totalCount || 0);
        setBlogPostsPage(page);
      }
    } catch { /* ignore */ }
    finally { setBlogPostsLoading(false); }
  }, []);

  useEffect(() => {
    getProfileFromApi().then(p => {
      if (!p) {
        window.location.href = '/auth/login';
        return;
      }
      // localStorage에서 커스텀 프로필 불러오기 (사진, 닉네임)
      const customData = localStorage.getItem(`blogger_custom_profile_${p.blogId}`);
      if (customData) {
        try {
          const parsed = JSON.parse(customData);
          setCustomProfile(parsed);
          if (parsed.displayName) p = { ...p, displayName: parsed.displayName };
          if (parsed.imageUrl) p = { ...p, imageUrl: parsed.imageUrl };
        } catch { /* ignore */ }
      }
      setProfile(p);

      // 구독 상태 확인 (이용권 기반)
      fetch('/api/license')
        .then(r => r.json())
        .then(data => setIsSubscribed(!!data.has_active))
        .catch(() => {});

      // 저장된 키워드 불러오기
      let savedKws: string[] = [];
      let savedRes: KeywordRank[] = [];
      const saved = localStorage.getItem(`blogger_keywords_${p.blogId}`);
      if (saved) {
        try { savedKws = JSON.parse(saved); setKeywords(savedKws); } catch { /* ignore */ }
      }
      const savedResults = localStorage.getItem(`blogger_results_${p.blogId}`);
      if (savedResults) {
        try { savedRes = JSON.parse(savedResults); setResults(savedRes); } catch { /* ignore */ }
      }

      // 블로그 키워드 자동 추출
      fetchExtractedKeywords(p.blogId);
      // DB에서 순위 히스토리 가져오기
      fetchRankHistory(p.blogId);
      // 블로그 포스트 목록 가져오기
      fetchBlogPosts(p.blogId, 1);

      // 미확인 키워드 자동 순위 확인 (1초 후 시작)
      if (savedKws.length > 0) {
        setTimeout(() => autoCheckUnchecked(savedKws, savedRes, p), 1000);
      }
    });
  }, [autoCheckUnchecked, fetchBlogPosts]);

  const fetchRankHistory = async (blogId: string) => {
    try {
      const res = await fetch(`/api/blog/rankings/history?blogId=${encodeURIComponent(blogId)}&days=15`);
      if (res.ok) {
        const data = await res.json();
        setRankHistory(data.keywords || []);
      }
    } catch { /* DB 테이블이 아직 없으면 무시 */ }
  };

  const fetchExtractedKeywords = async (blogId: string) => {
    setExtracting(true);
    try {
      const res = await fetch(`/api/blog/extract-keywords?blogId=${encodeURIComponent(blogId)}`);
      if (res.ok) {
        const data = await res.json();
        setExtractedKeywords(data.keywords || []);
      }
    } catch { /* ignore */ }
    finally { setExtracting(false); }
  };

  const handleProfileChange = useCallback((data: { displayName?: string; imageUrl?: string }) => {
    setCustomProfile(prev => {
      const updated = { ...prev, ...data };
      if (profile) {
        localStorage.setItem(`blogger_custom_profile_${profile.blogId}`, JSON.stringify(updated));
      }
      return updated;
    });
    // profile 상태도 업데이트
    setProfile(prev => prev ? { ...prev, ...data } : prev);
  }, [profile]);

  const saveKeywords = useCallback((kws: string[]) => {
    if (!profile) return;
    localStorage.setItem(`blogger_keywords_${profile.blogId}`, JSON.stringify(kws));
  }, [profile]);

  const saveResults = useCallback((res: KeywordRank[]) => {
    if (!profile) return;
    localStorage.setItem(`blogger_results_${profile.blogId}`, JSON.stringify(res));
  }, [profile]);

  const saveKeywordToDB = async (kw: string, isAuto: boolean = false) => {
    if (!profile) return;
    try {
      await fetch('/api/blog/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_id: profile.blogId, keyword: kw, is_auto: isAuto }),
      });
    } catch { /* DB가 아직 없으면 무시 */ }
  };

  const addKeyword = async (kw?: string) => {
    const target = kw || keyword.trim();
    if (!target || keywords.includes(target)) return;
    if (keywords.length >= 20) { alert('키워드는 최대 20개까지 등록할 수 있습니다.'); return; }
    const updated = [...keywords, target];
    setKeywords(updated);
    saveKeywords(updated);
    saveKeywordToDB(target, !!kw); // kw가 있으면 추천에서 추가 (자동)
    if (!kw) setKeyword('');
    // 키워드 추가 후 자동 순위 확인
    setTimeout(() => checkRank(target), 300);
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
            keyword: kw, rank: data.rank, prevRank: existing?.rank ?? null,
            totalResults: data.totalResults || 0, blogUrl: data.blogUrl || '',
            postTitle: data.postTitle || '', searchUrl: data.searchUrl || '',
            checkedAt: new Date().toISOString(),
          }];
          saveResults(updated);
          return updated;
        });
      }
    } catch { /* ignore */ }
    finally { setChecking(''); }
  };

  const checkAllRanks = async () => {
    if (!profile || keywords.length === 0) return;
    setLoading(true);
    setCheckProgress({ current: 0, total: keywords.length });
    for (let i = 0; i < keywords.length; i++) {
      setCheckProgress({ current: i + 1, total: keywords.length });
      await checkRank(keywords[i]);
      if (i < keywords.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setLoading(false);
    setCheckProgress({ current: 0, total: 0 });
    saveScoreToServer();
  };

  const saveScoreToServer = useCallback(async () => {
    if (!profile) return;
    const checked = results.filter(r => keywords.includes(r.keyword));
    const ranked = checked.filter(r => r.rank !== null).length;
    if (ranked === 0) return;
    const t5 = checked.filter(r => r.rank !== null && r.rank! <= 5).length;
    const t10 = checked.filter(r => r.rank !== null && r.rank! <= 10).length;
    const t20 = checked.filter(r => r.rank !== null && r.rank! <= 20).length;
    const avg = checked.filter(r => r.rank !== null).reduce((s, r) => s + (r.rank || 0), 0) / ranked;
    const imp = checked.filter(r => r.rank !== null && r.prevRank !== null && r.rank! < r.prevRank!).length;
    const dec = checked.filter(r => r.rank !== null && r.prevRank !== null && r.rank! > r.prevRank!).length;
    const cs = Math.min(100, Math.round((ranked / Math.max(keywords.length, 1)) * 40 + Math.min(keywords.length * 5, 30) + (ranked >= 5 ? 15 : ranked >= 3 ? 10 : ranked >= 1 ? 5 : 0) + (t20 >= 3 ? 15 : t20 >= 1 ? 8 : 0)));
    const rq = Math.max(0, 50 - (avg - 1) * 1.6);
    const ds = Math.min(100, Math.round(rq + (t10 / ranked) * 50));
    const sr = (imp + dec) > 0 ? imp / (imp + dec) : 0.5;
    const dp = Math.min(100, Math.round((t5 / ranked) * 40 + sr * 30 + (t5 >= 3 ? 20 : t5 >= 1 ? 10 : 0) + (avg <= 5 ? 10 : 0)));
    const total = Math.round((cs + ds + dp) / 3);
    const g = total >= 90 ? 'S' : total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';
    try {
      await fetch('/api/blog/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_id: profile.blogId, blog_name: profile.displayName, total_score: total, crank_score: cs, dia_score: ds, diaplus_score: dp, grade: g, keyword_count: keywords.length, ranked_count: ranked, avg_rank: Math.round(avg * 100) / 100, top5_count: t5, top10_count: t10 }),
      });
    } catch { /* ignore */ }
  }, [profile, results, keywords]);

  const resultMap = new Map(results.map(r => [r.keyword, r]));
  const checkedResults = results.filter(r => keywords.includes(r.keyword));
  const rankedCount = checkedResults.filter(r => r.rank !== null).length;
  const top5Count = checkedResults.filter(r => r.rank !== null && r.rank! <= 5).length;
  const top10Count = checkedResults.filter(r => r.rank !== null && r.rank! <= 10).length;
  const avgRank = rankedCount > 0 ? checkedResults.filter(r => r.rank !== null).reduce((s, r) => s + (r.rank || 0), 0) / rankedCount : 0;
  const improvedCount = checkedResults.filter(r => r.rank !== null && r.prevRank !== null && r.rank! < r.prevRank!).length;
  const declinedCount = checkedResults.filter(r => r.rank !== null && r.prevRank !== null && r.rank! > r.prevRank!).length;

  const top20Count = checkedResults.filter(r => r.rank !== null && r.rank! <= 20).length;
  const hasData = checkedResults.length > 0 && rankedCount > 0;
  const crankScore = hasData ? Math.min(100, Math.round((rankedCount / Math.max(keywords.length, 1)) * 40 + Math.min(keywords.length * 5, 30) + (rankedCount >= 5 ? 15 : rankedCount >= 3 ? 10 : rankedCount >= 1 ? 5 : 0) + (top20Count >= 3 ? 15 : top20Count >= 1 ? 8 : 0))) : 0;
  const rankQuality = avgRank > 0 ? Math.max(0, 50 - (avgRank - 1) * 1.6) : 0;
  const diaScore = hasData ? Math.min(100, Math.round(rankQuality + (top10Count / rankedCount) * 50)) : 0;
  const top5Ratio = rankedCount > 0 ? (top5Count / rankedCount) : 0;
  const stabilityRatio = (improvedCount + declinedCount) > 0 ? improvedCount / (improvedCount + declinedCount) : 0.5;
  const diaplusScore = hasData ? Math.min(100, Math.round(top5Ratio * 40 + stabilityRatio * 30 + (top5Count >= 3 ? 20 : top5Count >= 1 ? 10 : 0) + (avgRank > 0 && avgRank <= 5 ? 10 : 0))) : 0;
  const totalScore = hasData ? Math.round((crankScore + diaScore + diaplusScore) / 3) : 0;

  function getGrade(score: number) {
    if (score >= 90) return { grade: 'S', label: '최상위', color: 'text-accent', bg: 'bg-accent/10' };
    if (score >= 75) return { grade: 'A', label: '상위', color: 'text-up', bg: 'bg-up/10' };
    if (score >= 60) return { grade: 'B', label: '중상위', color: 'text-[#2DB400]', bg: 'bg-[#2DB400]/10' };
    if (score >= 40) return { grade: 'C', label: '중위', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { grade: 'D', label: '성장 중', color: 'text-dim', bg: 'bg-bg' };
  }
  const gradeInfo = getGrade(totalScore);

  // 변동 피드
  const activityEvents = generateBloggerEvents(
    checkedResults.map(r => ({ keyword: r.keyword, rank: r.rank, prevRank: r.prevRank }))
  );

  if (!profile) return null;

  return (
    <div className="space-y-6">

      {/* ─── 1. 프로필 헤더 ─── */}
      <ProfileHeader
        displayName={customProfile.displayName || profile.displayName}
        imageUrl={customProfile.imageUrl || profile.imageUrl}
        blogId={profile.blogId}
        type={profile.isInfluencer ? 'influencer' : 'blogger'}
        subscribed={isSubscribed}
        editable={true}
        onProfileChange={handleProfileChange}
      />

      {/* ─── 대시보드 (관리자 또는 구독자는 전체 접근) ─── */}
      <div className="space-y-6">

      {/* ─── 2. 통계 카드 4개 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AnimatedStatCard
          label="평균 순위"
          value={avgRank > 0 ? Math.round(avgRank) : 0}
          suffix="위"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>}
          color="accent"
          delay={50}
        />
        <AnimatedStatCard
          label="TOP 5 / TOP 10"
          value={top5Count}
          suffix={` / ${top10Count}`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          color={top5Count > 0 ? 'gold' : 'dim'}
          delay={100}
        />
        <AnimatedStatCard
          label="순위 상승"
          value={improvedCount}
          suffix="개"
          trend={declinedCount > 0 ? { direction: 'down', value: declinedCount } : undefined}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
          color={improvedCount > 0 ? 'up' : 'dim'}
          delay={150}
        />
        <AnimatedStatCard
          label="등록 키워드"
          value={keywords.length}
          suffix="/20"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          color={keywords.length > 0 ? 'accent' : 'dim'}
          delay={200}
        />
      </div>

      {/* ─── 3. 내 블로그 종합 점수 ─── */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-[15px]">내 블로그 종합 점수</h3>
            <p className="text-[11px] text-dim mt-0.5">전문성 · 콘텐츠 품질 · 검색 노출력 종합</p>
          </div>
          {hasData && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{totalScore}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeInfo.bg} ${gradeInfo.color}`}>
                {gradeInfo.grade}등급
              </span>
            </div>
          )}
        </div>

        {!hasData ? (
          <div className="text-center py-6 text-dim text-sm">
            <p>키워드를 등록하고 순위를 확인하면</p>
            <p>내 블로그 종합 등급이 계산됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <GradeGauge score={crankScore} label="전문성" description="꾸준함 · 주제 집중" color="#CC9486" delay={100} />
            <GradeGauge score={diaScore} label="품질" description="콘텐츠 퀄리티" color="#2E8B57" delay={200} />
            <GradeGauge score={diaplusScore} label="노출력" description="검색 상위 노출" color="#7B1FA2" delay={300} />
          </div>
        )}
      </GlassCard>

      {/* ─── 4. 순위 추이 차트 ─── */}
      {rankHistory.length > 0 && (
        <RankTrendSection mode="blogger" bloggerData={rankHistory} />
      )}

      {/* ─── 5. 순위 변동 피드 ─── */}
      {activityEvents.length > 0 && (
        <ActivityFeed events={activityEvents} />
      )}

      {/* ─── 5. 블로그 키워드 자동 추천 + 수동 등록 ─── */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-[15px]">키워드 등록</h3>
            <p className="text-[11px] text-dim mt-0.5">블로그 분석으로 추천된 키워드를 추가하거나 직접 입력하세요</p>
          </div>
          {keywords.length > 0 && (
            <button
              onClick={checkAllRanks}
              disabled={loading}
              className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {checkProgress.current}/{checkProgress.total}
                </span>
              ) : '전체 확인'}
            </button>
          )}
        </div>

        {/* 자동 추출 키워드 추천 */}
        {extractedKeywords.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] text-dim mb-2 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              블로그 분석 추천 키워드 — 클릭하여 추가
            </p>
            <div className="flex flex-wrap gap-1.5">
              {extractedKeywords.slice(0, 12).map(ek => {
                const isAdded = keywords.includes(ek.keyword);
                return (
                  <button
                    key={ek.keyword}
                    onClick={() => !isAdded && addKeyword(ek.keyword)}
                    disabled={isAdded}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                      isAdded
                        ? 'bg-accent/10 text-accent border border-accent/30'
                        : 'bg-bg border border-border hover:border-accent/40 hover:bg-accent/5 text-text'
                    }`}
                  >
                    {isAdded && <span className="mr-1">✓</span>}
                    {ek.keyword}
                    <span className="text-dim ml-1">({ek.postCount})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {extracting && (
          <div className="mb-4 flex items-center gap-2 text-xs text-dim">
            <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            블로그를 분석하고 있습니다...
          </div>
        )}

        {/* 수동 입력 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="키워드 직접 입력 (예: 맛집추천, 여행코스)"
            className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
          />
          <button
            onClick={() => addKeyword()}
            disabled={!keyword.trim()}
            className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0"
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
                  <button onClick={() => removeKeyword(kw)} className="text-dim hover:text-down transition cursor-pointer ml-0.5">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l6 6M10 4l-6 6"/></svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* ─── 6. 순위 결과 ─── */}
      {keywords.length > 0 && (
        <GlassCard padding="none">
          <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[15px]">블로그탭 키워드 순위</h3>
              <p className="text-[11px] text-dim mt-0.5">네이버 검색 → 블로그 탭 기준 (TOP 30까지 확인)</p>
            </div>
            {checkedResults.length > 0 && (
              <span className="text-[11px] text-dim">{timeAgo(checkedResults[checkedResults.length - 1]?.checkedAt)}</span>
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
                        <a href={result?.searchUrl || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`}
                          target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent transition">{kw}</a>
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {result ? (
                          result.rank !== null ? (
                            <span className={`font-black font-rank text-base ${
                              result.rank <= 3 ? 'text-accent' : result.rank <= 5 ? 'text-orange-500' : result.rank <= 10 ? 'text-up' : result.rank <= 20 ? 'text-[#2DB400]' : 'text-dim'
                            }`}>{result.rank}위</span>
                          ) : <span className="text-dim text-xs">30위 밖</span>
                        ) : <span className="text-dim">—</span>}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        <RankChange current={result?.rank ?? null} prev={result?.prevRank ?? null} />
                      </td>
                      <td className="px-3 py-3.5">
                        {result?.postTitle && result.rank !== null ? (
                          <a href={result.blogUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-dim hover:text-accent transition truncate block max-w-[200px]" title={result.postTitle}>{result.postTitle}</a>
                        ) : <span className="text-xs text-dim">—</span>}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {result && <span className="text-[10px] text-dim">{timeAgo(result.checkedAt)}</span>}
                      </td>
                      <td className="text-right px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <RankBadge rank={result?.rank ?? null} checked={!!result} />
                          <button onClick={() => checkRank(kw)} disabled={checking === kw || loading}
                            className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50 opacity-0 group-hover:opacity-100 transition">
                            {checking === kw ? <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" /> : '확인'}
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
                      <a href={result?.searchUrl || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`}
                        target="_blank" rel="noopener noreferrer" className="font-semibold text-sm truncate">{kw}</a>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {result?.rank !== null && result?.rank !== undefined ? (
                        <span className={`text-lg font-black font-rank ${result.rank <= 3 ? 'text-accent' : result.rank <= 10 ? 'text-up' : 'text-dim'}`}>{result.rank}위</span>
                      ) : result ? <span className="text-xs text-dim">30위 밖</span> : null}
                      <RankChange current={result?.rank ?? null} prev={result?.prevRank ?? null} />
                      <button onClick={() => checkRank(kw)} disabled={checking === kw || loading}
                        className="text-xs text-accent cursor-pointer disabled:opacity-50 pl-1">
                        {checking === kw ? <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" /> : '확인'}
                      </button>
                    </div>
                  </div>
                  {result?.postTitle && result.rank !== null && (
                    <div className="mt-1 ml-7">
                      <a href={result.blogUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-dim hover:text-accent transition truncate block">{result.postTitle}</a>
                    </div>
                  )}
                  <div className="mt-1 ml-7 flex items-center gap-2">
                    <RankBadge rank={result?.rank ?? null} checked={!!result} />
                    {result && <span className="text-[10px] text-dim">{timeAgo(result.checkedAt)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* ─── 7. 빈 상태 ─── */}
      {keywords.length === 0 && !extracting && (
        <GlassCard className="text-center py-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </div>
          <h3 className="font-bold text-base mb-2">키워드를 등록해보세요</h3>
          <p className="text-sm text-dim leading-relaxed max-w-md mx-auto">
            내 블로그가 네이버 블로그탭에서 몇 위에 노출되는지<br />키워드별로 추적할 수 있습니다.
          </p>
        </GlassCard>
      )}


      {/* ─── 8. 내 블로그 포스팅 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[15px]">내 블로그 포스팅</h3>
            <p className="text-[11px] text-dim mt-0.5">
              {blogPostsTotal > 0 ? `총 ${blogPostsTotal.toLocaleString()}개의 글` : '포스트 목록을 불러오는 중...'}
            </p>
          </div>
          <a
            href={`https://blog.naver.com/${profile.blogId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-accent hover:underline font-semibold"
          >
            블로그 방문 →
          </a>
        </div>

        {blogPostsLoading && blogPosts.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : blogPosts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">
            포스트가 없습니다.
          </div>
        ) : (
          <>
            {/* 데스크톱 */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">댓글</th>
                    <th className="text-right px-5 py-3 font-semibold w-28">작성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {blogPosts.map((post, i) => (
                    <tr key={post.id} className="hover:bg-surface-hover transition group">
                      <td className="px-5 py-3 text-dim text-xs">{(blogPostsPage - 1) * 10 + i + 1}</td>
                      <td className="px-3 py-3">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:text-accent transition truncate block max-w-[400px]"
                          title={post.title}
                        >
                          {post.title}
                        </a>
                      </td>
                      <td className="text-center px-3 py-3">
                        {post.commentCount > 0 ? (
                          <span className="text-xs text-accent font-semibold">{post.commentCount}</span>
                        ) : (
                          <span className="text-xs text-dim">—</span>
                        )}
                      </td>
                      <td className="text-right px-5 py-3 text-xs text-dim">{post.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 */}
            <div className="md:hidden divide-y divide-border/20">
              {blogPosts.map((post, i) => (
                <div key={post.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{(blogPostsPage - 1) * 10 + i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-sm hover:text-accent transition line-clamp-2"
                      >
                        {post.title}
                      </a>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-dim">
                        <span>{post.date}</span>
                        {post.commentCount > 0 && (
                          <span className="text-accent">댓글 {post.commentCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 페이지네이션 */}
            {blogPostsTotal > 10 && (
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                <button
                  onClick={() => profile && fetchBlogPosts(profile.blogId, blogPostsPage - 1)}
                  disabled={blogPostsPage <= 1 || blogPostsLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← 이전
                </button>
                <span className="text-xs text-dim px-2">
                  {blogPostsPage} / {Math.ceil(blogPostsTotal / 10)}
                </span>
                <button
                  onClick={() => profile && fetchBlogPosts(profile.blogId, blogPostsPage + 1)}
                  disabled={blogPostsPage >= Math.ceil(blogPostsTotal / 10) || blogPostsLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  다음 →
                </button>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* ─── 9. 블로그 위젯 ─── */}
      {hasData && (
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-[15px]">블로그 등급 위젯</h3>
              <p className="text-[11px] text-dim mt-0.5">내 블로그에 등급 뱃지를 달아보세요</p>
            </div>
          </div>
          <div className="flex justify-center mb-4 p-4 bg-bg rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/widget/${profile.blogId}`} alt="블로그 등급 위젯" width={280} height={155} className="rounded-lg" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-dim mb-1.5">HTML 코드</p>
            <div className="relative">
              <code className="block bg-bg border border-border rounded-lg p-3 text-[11px] text-dim font-mono break-all leading-relaxed select-all">
                {`<a href="https://naver-influencer.vercel.app/my/blogger" target="_blank" rel="noopener"><img src="https://naver-influencer.vercel.app/api/widget/${profile.blogId}" alt="N인플 블로그 등급" width="280" /></a>`}
              </code>
              <button onClick={() => { navigator.clipboard.writeText(`<a href="https://naver-influencer.vercel.app/my/blogger" target="_blank" rel="noopener"><img src="https://naver-influencer.vercel.app/api/widget/${profile.blogId}" alt="N인플 블로그 등급" width="280" /></a>`); alert('복사되었습니다!'); }}
                className="absolute top-2 right-2 px-2.5 py-1 bg-accent text-white text-[10px] font-bold rounded-md hover:bg-accent-hover transition cursor-pointer">복사</button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── 10. 무료 기능 + 인플루언서 전환 ─── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/search-volume" className="group">
          <GlassCard hover className="flex items-center gap-3 h-full">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </div>
            <div>
              <p className="font-bold text-sm">검색량 조회</p>
              <p className="text-[11px] text-dim mt-0.5">키워드 월간 검색량 무료 확인</p>
            </div>
          </GlassCard>
        </Link>
        <Link href="/community" className="group">
          <GlassCard hover className="flex items-center gap-3 h-full">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div>
              <p className="font-bold text-sm">커뮤니티</p>
              <p className="text-[11px] text-dim mt-0.5">블로거들의 소통 공간</p>
            </div>
          </GlassCard>
        </Link>
      </div>

      {profile.isInfluencer ? (
        <GlassCard className="text-center">
          <p className="text-sm font-semibold mb-1">인플루언서 대시보드로 돌아가기</p>
          <p className="text-xs text-dim mb-3">키워드챌린지 순위, 경쟁 분석 등을 확인하세요.</p>
          <Link href="/my" className="text-sm text-accent font-bold hover:underline">인플루언서 대시보드 →</Link>
        </GlassCard>
      ) : (
        <GlassCard className="text-center">
          <p className="text-sm font-semibold mb-1">네이버 인플루언서이신가요?</p>
          <p className="text-xs text-dim mb-3">키워드챌린지 순위, 경쟁 분석 등을 확인하세요.</p>
          <Link href="/auth/login" className="text-sm text-accent font-bold hover:underline">인플루언서로 로그인 →</Link>
        </GlassCard>
      )}

      </div>
    </div>
  );
}
