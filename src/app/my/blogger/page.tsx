'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';
import GradeGauge from '@/components/dashboard/GradeGauge';
import BlogVisitorChart from '@/components/dashboard/BlogVisitorChart';

interface BloggerProfile {
  blogId: string;
  displayName: string;
  isInfluencer: boolean;
  imageUrl?: string;
  needsBlogId?: boolean;
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  date: string;
  isPublic: boolean;
}

interface MissingResult {
  blogTab: { exposed: boolean; rank: number | null };
  viewTab: { exposed: boolean; rank: number | null };
}

interface BlogScoreData {
  total_score: number;
  grade: string;
  rank: number;
  totalBloggers: number;
  categoryRank: number;
  categoryTotal: number;
  category: string;
}

interface BlogAnalysisMetrics {
  postsWithImages: number;
  longPosts: number;
  postsWithHeadings: number;
  avgCharCount: number;
  postsWithMedia: number;
  originalImageRatio: number;
  avgImageSizeKB: number;
  postsWithOriginalImages: number;
  avgPersonalPronounRatio: number;
  avgUniqueWordRatio: number;
  postsWithLists: number;
  postsWithQuotations: number;
}

interface BlogAnalysisAverages {
  charCount: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;
  paragraphCount: number;
  linkCount: number;
  headingCount: number;
  personalPronounCount: number;
  uniqueWordRatio: number;
  listItemCount: number;
  quotationCount: number;
}

const CATEGORIES = [
  '맛집', '여행', '뷰티', '패션', 'IT/테크', '육아',
  '인테리어', '건강', '반려동물', '자동차', '부동산',
  '경제/재테크', '교육', '문화/예술', '스포츠', '일상/라이프', '기타',
];

async function getProfileFromApi(): Promise<BloggerProfile | null> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.type === 'unified' && (data.blogId || data.id)) {
      return { blogId: data.blogId || data.id, displayName: data.name || data.blogId || data.id, isInfluencer: true };
    }
    if (data.type === 'blogger' && data.id) {
      return { blogId: data.id, displayName: data.name || data.id, isInfluencer: false };
    }
    if (data.type === 'influencer' && data.id) {
      return { blogId: data.blogId || data.id, displayName: data.name || data.id, isInfluencer: true, needsBlogId: !data.blogId };
    }
    return null;
  } catch { return null; }
}

export default function BloggerDashboard() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [customProfile, setCustomProfile] = useState<{ displayName?: string; imageUrl?: string }>({});
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [blogPostsPage, setBlogPostsPage] = useState(1);
  const [blogPostsLoading, setBlogPostsLoading] = useState(false);
  const [missingResults, setMissingResults] = useState<Record<string, MissingResult>>({});
  const [checkingMissing, setCheckingMissing] = useState<string>('');
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  const [scoreData, setScoreData] = useState<BlogScoreData | null>(null);
  const [category, setCategory] = useState('기타');
  const [suggestedCategory, setSuggestedCategory] = useState('기타');
  const [showCategorySelect, setShowCategorySelect] = useState(false);
  const [postAnalysis, setPostAnalysis] = useState<{ metrics: BlogAnalysisMetrics; averages: BlogAnalysisAverages } | null>(null);

  // 점수 계산용 ref
  const latestScoresRef = useRef({ total: 0, scores: [0, 0, 0, 0, 0, 0], grade: 'D' });

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

  const fetchScoreData = useCallback(async (blogId: string) => {
    try {
      const res = await fetch(`/api/blog/score?blogId=${encodeURIComponent(blogId)}`);
      if (res.ok) {
        const data = await res.json();
        setScoreData(data);
        setCategory(data.category || '기타');
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCategory = useCallback(async (blogId: string) => {
    try {
      const res = await fetch(`/api/blog/category?blogId=${encodeURIComponent(blogId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.current) setCategory(data.current);
        if (data.suggested) setSuggestedCategory(data.suggested);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchPostAnalysis = useCallback(async (blogId: string) => {
    try {
      const res = await fetch(`/api/blog/analyze?blogId=${encodeURIComponent(blogId)}&count=10`);
      if (res.ok) {
        const data = await res.json();
        if (data.analyzedCount > 0) {
          setPostAnalysis({ metrics: data.metrics, averages: data.averages });
        }
      }
    } catch { /* ignore */ }
  }, []);

  const saveScoreToServer = useCallback(async () => {
    if (!profile) return;
    const { total, scores, grade } = latestScoresRef.current;
    if (total === 0) return;
    try {
      await fetch('/api/blog/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blog_id: profile.blogId, blog_name: profile.displayName,
          total_score: total, grade,
          crank_score: Math.round((scores[0] + scores[2]) / 2),
          dia_score: Math.round((scores[1] + scores[3]) / 2),
          diaplus_score: Math.round((scores[4] + scores[5]) / 2),
        }),
      });
      fetchScoreData(profile.blogId);
    } catch { /* ignore */ }
  }, [profile, fetchScoreData]);

  useEffect(() => {
    getProfileFromApi().then(p => {
      if (!p) { window.location.href = '/auth/login'; return; }
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
      fetchBlogPosts(p.blogId, 1);
      fetchScoreData(p.blogId);
      fetchCategory(p.blogId);
      fetchPostAnalysis(p.blogId);
    });
  }, [fetchBlogPosts, fetchScoreData, fetchCategory, fetchPostAnalysis]);

  // 분석 완료 시 점수 자동 저장
  const analysisSavedRef = useRef(false);
  useEffect(() => {
    if (profile && postAnalysis && !analysisSavedRef.current) {
      analysisSavedRef.current = true;
      setTimeout(() => saveScoreToServer(), 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postAnalysis]);

  const handleProfileChange = useCallback((data: { displayName?: string; imageUrl?: string }) => {
    setCustomProfile(prev => {
      const updated = { ...prev, ...data };
      if (profile) localStorage.setItem(`blogger_custom_profile_${profile.blogId}`, JSON.stringify(updated));
      return updated;
    });
    setProfile(prev => prev ? { ...prev, ...data } : prev);
  }, [profile]);

  const checkMissing = async (post: BlogPost) => {
    if (!profile) return;
    setCheckingMissing(post.id);
    try {
      const res = await fetch('/api/blog/check-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postTitle: post.title, postId: post.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setMissingResults(prev => ({ ...prev, [post.id]: data }));
      }
    } catch { /* ignore */ }
    finally { setCheckingMissing(''); }
  };

  const checkAllMissing = async () => {
    if (!profile || blogPosts.length === 0) return;
    setCheckingAll(true);
    setCheckProgress({ current: 0, total: blogPosts.length });
    for (let i = 0; i < blogPosts.length; i++) {
      setCheckProgress({ current: i + 1, total: blogPosts.length });
      await checkMissing(blogPosts[i]);
      if (i < blogPosts.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setCheckingAll(false);
    setCheckProgress({ current: 0, total: 0 });
  };

  const saveCategory = async (cat: string) => {
    if (!profile) return;
    setCategory(cat);
    setShowCategorySelect(false);
    try {
      await fetch('/api/blog/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, category: cat }),
      });
      fetchScoreData(profile.blogId);
    } catch { /* ignore */ }
  };

  // ── 좋은 문서 기준 6가지 점수 (placeholder — 사용자 기준 전달 시 교체) ──
  const pa = postAnalysis;
  const hasAnalysis = !!pa;

  const reliabilityScore = pa ? Math.min(100, Math.round(
    (pa.averages.linkCount >= 3 ? 30 : pa.averages.linkCount >= 2 ? 22 : pa.averages.linkCount >= 1 ? 15 : 3) +
    (pa.metrics.postsWithQuotations >= 0.5 ? 20 : pa.metrics.postsWithQuotations >= 0.2 ? 12 : pa.averages.quotationCount >= 1 ? 8 : 0) +
    (pa.metrics.originalImageRatio >= 0.5 ? 30 : pa.metrics.originalImageRatio >= 0.3 ? 20 : 10) +
    (pa.metrics.postsWithImages >= 0.8 ? 20 : pa.metrics.postsWithImages >= 0.5 ? 12 : 5)
  )) : 0;

  const experienceScore = pa ? Math.min(100, Math.round(
    pa.metrics.originalImageRatio * 25 +
    Math.min(25, pa.metrics.avgPersonalPronounRatio * 800) +
    pa.metrics.postsWithOriginalImages * 15 +
    pa.metrics.postsWithMedia * 15 +
    (pa.metrics.avgImageSizeKB >= 500 ? 10 : pa.metrics.avgImageSizeKB >= 200 ? 7 : pa.metrics.avgImageSizeKB >= 100 ? 5 : 0) +
    pa.metrics.postsWithImages * 10
  )) : 0;

  const originalityScore = pa ? Math.min(100, Math.round(
    (pa.metrics.avgUniqueWordRatio >= 0.7 ? 25 : pa.metrics.avgUniqueWordRatio >= 0.6 ? 20 : pa.metrics.avgUniqueWordRatio >= 0.5 ? 15 : pa.metrics.avgUniqueWordRatio >= 0.4 ? 10 : 5) +
    (pa.metrics.avgCharCount >= 2000 ? 25 : pa.metrics.avgCharCount >= 1500 ? 20 : pa.metrics.avgCharCount >= 1000 ? 15 : pa.metrics.avgCharCount >= 500 ? 8 : 3) +
    pa.metrics.longPosts * 20 +
    pa.metrics.originalImageRatio * 15 +
    (pa.metrics.postsWithHeadings >= 0.5 ? 15 : pa.metrics.postsWithHeadings >= 0.2 ? 10 : 0)
  )) : 0;

  const depthScore = pa ? Math.min(100, Math.round(
    (pa.metrics.avgCharCount >= 2000 ? 25 : pa.metrics.avgCharCount >= 1500 ? 20 : pa.metrics.avgCharCount >= 1000 ? 15 : pa.metrics.avgCharCount >= 500 ? 8 : 3) +
    (pa.averages.paragraphCount >= 15 ? 20 : pa.averages.paragraphCount >= 10 ? 15 : pa.averages.paragraphCount >= 5 ? 10 : 3) +
    (pa.averages.imageCount >= 8 ? 15 : pa.averages.imageCount >= 5 ? 12 : pa.averages.imageCount >= 3 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.5 ? 15 : pa.metrics.postsWithLists >= 0.2 ? 10 : pa.averages.listItemCount >= 1 ? 5 : 0) +
    Math.min(15, Math.round(pa.metrics.longPosts * 15)) +
    (pa.averages.headingCount >= 3 ? 10 : pa.averages.headingCount >= 1 ? 5 : 0)
  )) : 0;

  const readabilityScore = pa ? Math.min(100, Math.round(
    pa.metrics.postsWithHeadings * 25 +
    (pa.averages.headingCount >= 5 ? 20 : pa.averages.headingCount >= 3 ? 15 : pa.averages.headingCount >= 1 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.3 ? 15 : pa.metrics.postsWithLists >= 0.1 ? 8 : 0) +
    (pa.averages.imageCount >= 3 && pa.averages.imageCount <= 20 ? 20 : pa.averages.imageCount >= 1 ? 10 : 0) +
    (pa.averages.paragraphCount >= 5 ? 10 : pa.averages.paragraphCount >= 3 ? 5 : 0) +
    (pa.metrics.avgCharCount >= 500 ? 10 : pa.metrics.avgCharCount >= 300 ? 5 : 0)
  )) : 0;

  const consistencyScore = (() => {
    if (blogPosts.length === 0) return 0;
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let recentCount = 0, monthCount = 0;
    const postDates: Date[] = [];
    for (const p of blogPosts) {
      const match = p.date.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
      if (!match) continue;
      const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      postDates.push(d);
      if (d >= twoWeeksAgo) recentCount++;
      if (d >= oneMonthAgo) monthCount++;
    }
    const recentPostScore = Math.min(40, recentCount * 10);
    const regularityScore = Math.min(30, monthCount >= 8 ? 30 : monthCount >= 4 ? 20 : monthCount >= 2 ? 10 : 0);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const veryRecent = postDates.some(d => d >= threeDaysAgo);
    const streakBonus = veryRecent ? 30 : (recentCount > 0 ? 15 : 0);
    return Math.min(100, Math.round(recentPostScore + regularityScore + streakBonus));
  })();

  const allScores = [reliabilityScore, experienceScore, originalityScore, depthScore, readabilityScore, consistencyScore];
  const totalScore = hasAnalysis || blogPosts.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  function getGrade(score: number) {
    if (score >= 90) return { grade: 'S', color: 'text-accent', bg: 'bg-accent/10' };
    if (score >= 75) return { grade: 'A', color: 'text-up', bg: 'bg-up/10' };
    if (score >= 60) return { grade: 'B', color: 'text-[#2DB400]', bg: 'bg-[#2DB400]/10' };
    if (score >= 40) return { grade: 'C', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { grade: 'D', color: 'text-dim', bg: 'bg-bg' };
  }
  const gradeInfo = getGrade(totalScore);
  latestScoresRef.current = { total: totalScore, scores: allScores, grade: gradeInfo.grade };

  // 주간 평균 발행량
  const weeklyAvg = (() => {
    if (blogPosts.length === 0) return 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let recentCount = 0;
    for (const p of blogPosts) {
      const match = p.date.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
      if (match) {
        const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        if (d >= thirtyDaysAgo) recentCount++;
      }
    }
    return Math.round(recentCount / 4 * 10) / 10;
  })();

  if (!profile) return null;

  // 블로그 ID 미등록 시
  if (profile.needsBlogId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-md mx-auto text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">블로그 주소를 등록해주세요</h2>
            <p className="text-sm text-dim">블로그 분석 기능을 이용하려면 블로그 주소가 필요합니다.</p>
          </div>
          <div className="flex items-center gap-2 max-w-sm mx-auto">
            <div className="flex items-center flex-1 bg-bg border border-border rounded-xl overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 transition">
              <span className="px-3 text-sm text-dim shrink-0 border-r border-border bg-border/30">blog.naver.com/</span>
              <input id="blog-id-input" type="text" placeholder="블로그 아이디"
                className="flex-1 px-3 py-3 bg-transparent text-sm text-text placeholder:text-dim/60 focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('blog-id-submit')?.click(); } }} />
            </div>
            <button id="blog-id-submit" onClick={() => {
              const input = (document.getElementById('blog-id-input') as HTMLInputElement)?.value.trim();
              if (!input) return;
              const blogId = input.replace(/^@/, '').toLowerCase();
              document.cookie = `blog_id=${blogId}; path=/; max-age=${365 * 24 * 60 * 60}`;
              window.location.reload();
            }} className="px-5 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer text-sm shrink-0">
              등록
            </button>
          </div>
          <Link href="/my" className="text-sm text-accent font-bold hover:underline">← 키챌 대시보드로 돌아가기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ─── 1. 프로필 헤더 ─── */}
      <ProfileHeader
        displayName={customProfile.displayName || profile.displayName}
        imageUrl={customProfile.imageUrl || profile.imageUrl}
        blogId={profile.blogId}
        type={profile.isInfluencer ? 'influencer' : 'blogger'}
        subscribed={true}
        editable={true}
        onProfileChange={handleProfileChange}
      />

      {/* ─── 카테고리 선택 ─── */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-dim">카테고리:</span>
        <button
          onClick={() => setShowCategorySelect(!showCategorySelect)}
          className="px-3 py-1 bg-accent/10 text-accent font-semibold rounded-lg hover:bg-accent/20 transition cursor-pointer text-sm"
        >
          {category}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline ml-1"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {category === '기타' && suggestedCategory !== '기타' && (
          <button onClick={() => saveCategory(suggestedCategory)}
            className="text-xs text-accent hover:underline cursor-pointer">
            추천: {suggestedCategory}
          </button>
        )}
      </div>
      {showCategorySelect && (
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => saveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                cat === category ? 'bg-accent text-white' : 'bg-bg border border-border hover:border-accent/40 text-text'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ─── 2. 핵심 지표 카드 (4개) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AnimatedStatCard
          label="주간 평균 발행"
          value={weeklyAvg}
          suffix="회/주"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
          color={weeklyAvg >= 2 ? 'up' : weeklyAvg >= 1 ? 'accent' : 'dim'}
          delay={50}
        />
        <AnimatedStatCard
          label="블로그 지수"
          value={totalScore}
          suffix={`(${gradeInfo.grade})`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>}
          color={totalScore >= 60 ? 'up' : totalScore >= 40 ? 'accent' : 'dim'}
          delay={100}
        />
        <AnimatedStatCard
          label="전체 순위"
          value={scoreData?.rank || 0}
          suffix={scoreData ? `/${scoreData.totalBloggers}` : ''}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          color={scoreData && scoreData.rank <= 10 ? 'gold' : 'accent'}
          delay={150}
        />
        <AnimatedStatCard
          label={`${category} 순위`}
          value={scoreData?.categoryRank || 0}
          suffix={scoreData ? `/${scoreData.categoryTotal}` : ''}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>}
          color={scoreData && scoreData.categoryRank <= 5 ? 'gold' : 'accent'}
          delay={200}
        />
      </div>

      {/* ─── 3. 블로그 지수 상세 (좋은 문서 기준 — TBD) ─── */}
      {(hasAnalysis || blogPosts.length > 0) && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-[15px]">블로그 지수</h3>
              <p className="text-[11px] text-dim mt-0.5">좋은 문서 기준 6가지 평가 (기준 업데이트 예정)</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-3xl font-black font-rank ${gradeInfo.color}`}>{totalScore}</span>
              <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${gradeInfo.bg} ${gradeInfo.color}`}>{gradeInfo.grade}등급</span>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: '신뢰성', score: reliabilityScore, desc: '출처/인용' },
              { label: '경험', score: experienceScore, desc: '직접촬영/체험' },
              { label: '독창성', score: originalityScore, desc: '고유표현/원본' },
              { label: '심층성', score: depthScore, desc: '글자수/구성' },
              { label: '가독성', score: readabilityScore, desc: '소제목/리스트' },
              { label: '꾸준함', score: consistencyScore, desc: '발행빈도' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <GradeGauge
                  score={item.score}
                  label={item.label}
                  description={item.desc}
                  color={item.score >= 70 ? '#22C55E' : item.score >= 40 ? '#F29C68' : '#94a3b8'}
                  delay={100}
                />
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ─── 4. 블로그 방문자수 차트 ─── */}
      {profile && <BlogVisitorChart blogId={profile.blogId} />}

      {/* ─── 5. 포스팅 목록 + 누락 확인 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[15px]">내 블로그 포스팅</h3>
            <p className="text-[11px] text-dim mt-0.5">
              {blogPostsTotal > 0 ? `총 ${blogPostsTotal.toLocaleString()}개의 글` : '포스트 목록을 불러오는 중...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {blogPosts.length > 0 && (
              <button onClick={checkAllMissing} disabled={checkingAll}
                className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0">
                {checkingAll ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {checkProgress.current}/{checkProgress.total}
                  </span>
                ) : '전체 누락확인'}
              </button>
            )}
            <a href={`https://blog.naver.com/${profile.blogId}`} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-accent hover:underline font-semibold">블로그 방문 →</a>
          </div>
        </div>

        {blogPostsLoading && blogPosts.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : blogPosts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">포스트가 없습니다.</div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">블로그탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">댓글</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">작성일</th>
                    <th className="text-center px-5 py-3 font-semibold w-16">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {blogPosts.map((post, i) => {
                    const mr = missingResults[post.id];
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition group">
                        <td className="px-5 py-3.5 text-dim text-xs">{(blogPostsPage - 1) * 10 + i + 1}</td>
                        <td className="px-3 py-3.5">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[350px]" title={post.title}>
                            {post.title}
                          </a>
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {mr ? (
                            mr.blogTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {mr.blogTab.rank}위
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-down bg-down/10 px-2 py-0.5 rounded-full">누락</span>
                            )
                          ) : (
                            <span className="text-[10px] text-dim/50">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {mr ? (
                            mr.viewTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {mr.viewTab.rank}위
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-down bg-down/10 px-2 py-0.5 rounded-full">누락</span>
                            )
                          ) : (
                            <span className="text-[10px] text-dim/50">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.commentCount > 0 ? (
                            <span className="text-xs text-accent font-semibold">{post.commentCount}</span>
                          ) : <span className="text-xs text-dim">—</span>}
                        </td>
                        <td className="text-right px-3 py-3.5 text-xs text-dim">{post.date}</td>
                        <td className="text-center px-5 py-3.5">
                          <button onClick={() => checkMissing(post)}
                            disabled={checkingMissing === post.id || checkingAll}
                            className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50">
                            {checkingMissing === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : mr ? '재확인' : '확인'}
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
              {blogPosts.map((post, i) => {
                const mr = missingResults[post.id];
                return (
                  <div key={post.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{(blogPostsPage - 1) * 10 + i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">{post.title}</a>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {mr ? (
                            <>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                mr.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                              }`}>
                                블로그 {mr.blogTab.exposed ? `${mr.blogTab.rank}위` : '누락'}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                mr.viewTab.exposed ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                              }`}>
                                VIEW {mr.viewTab.exposed ? `${mr.viewTab.rank}위` : '누락'}
                              </span>
                            </>
                          ) : null}
                          <span className="text-[11px] text-dim">{post.date}</span>
                          {post.commentCount > 0 && <span className="text-[11px] text-accent">댓글 {post.commentCount}</span>}
                          <button onClick={() => checkMissing(post)}
                            disabled={checkingMissing === post.id || checkingAll}
                            className="text-[10px] text-accent cursor-pointer disabled:opacity-50">
                            {checkingMissing === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : mr ? '재확인' : '누락확인'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {blogPostsTotal > 10 && (
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                <button onClick={() => profile && fetchBlogPosts(profile.blogId, blogPostsPage - 1)}
                  disabled={blogPostsPage <= 1 || blogPostsLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  ← 이전
                </button>
                <span className="text-xs text-dim px-2">{blogPostsPage} / {Math.ceil(blogPostsTotal / 10)}</span>
                <button onClick={() => profile && fetchBlogPosts(profile.blogId, blogPostsPage + 1)}
                  disabled={blogPostsPage >= Math.ceil(blogPostsTotal / 10) || blogPostsLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  다음 →
                </button>
              </div>
            )}
          </>
        )}
      </GlassCard>

    </div>
  );
}
