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

// 한국어 조사 제거: "블로그의" → "블로그", "미래는" → "미래"
function stripParticles(word: string): string {
  // 2글자 조사부터 (긴 것 먼저)
  const particles2 = ['에서','에게','으로','처럼','만큼','부터','까지','마저','조차','이란','이라','에는','에도','으로서'];
  for (const p of particles2) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  // 1글자 조사
  const particles1 = ['의','에','를','을','이','가','는','은','와','과','도','로','만','란','라','며','면','야'];
  for (const p of particles1) {
    if (word.length > 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

// 포스팅 제목에서 핵심 키워드 추출
function extractKeywords(title: string, blogId: string, displayName?: string): string {
  let cleaned = title;
  // 1. blogId + displayName + 닉네임 변형 제거
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) {
    removePatterns.push(displayName);
    if (displayName.length >= 4) {
      removePatterns.push(displayName.slice(0, Math.ceil(displayName.length / 2)));
    }
  }
  const suffixes = ['단상', '도서관', '지음', '블로그', '일기', '기록', '이야기', '스토리'];
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(p, 'gi'), ' ');
  }
  for (const s of suffixes) {
    if (displayName && cleaned.toLowerCase().includes(displayName.slice(0, 3).toLowerCase() + s)) {
      cleaned = cleaned.replace(new RegExp(displayName.slice(0, 3) + s, 'gi'), ' ');
    }
  }
  // 2. 괄호 제거
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // 3. 복합어 분리 (의미 단위가 붙어있는 경우만)
  cleaned = cleaned.replace(/([가-힣]{2,})(명대사|명언|글귀|해석|도서관|지음|런칭|소식|업데이트|참여|강의|모집|발행)/g, '$1 $2');
  // 4. 특수문자 제거 + 분리
  const rawWords = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // 5. 조사 제거 + 불용어 필터
  const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','대한','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
  const words = rawWords
    .map(w => /^[가-힣]+$/.test(w) ? stripParticles(w) : w) // 한글만 조사 제거
    .filter(w => w.length >= 1 && !stop.has(w) && !/^\d+$/.test(w) && !/^[a-zA-Z]$/.test(w));
  return words.slice(0, 3).join(' ') || title.slice(0, 20);
}

export default function BloggerDashboard() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [customProfile, setCustomProfile] = useState<{ displayName?: string; imageUrl?: string }>({});
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [allBlogPosts, setAllBlogPosts] = useState<BlogPost[]>([]); // 통계용 전체 포스트
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

  // 전체 포스트 로드 (모든 페이지 순회)
  const fetchAllBlogPosts = useCallback(async (blogId: string) => {
    try {
      const allPosts: BlogPost[] = [];
      let page = 1;
      const perPage = 30;
      let totalCount = 0;

      // 첫 페이지 로드
      const firstRes = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=1&count=${perPage}`);
      if (!firstRes.ok) return;
      const firstData = await firstRes.json();
      allPosts.push(...(firstData.posts || []));
      totalCount = firstData.totalCount || 0;
      setBlogPostsTotal(totalCount);

      // 나머지 페이지 로드
      const totalPages = Math.ceil(totalCount / perPage);
      for (page = 2; page <= totalPages; page++) {
        const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${perPage}`);
        if (!res.ok) break;
        const data = await res.json();
        const posts = data.posts || [];
        if (posts.length === 0) break;
        allPosts.push(...posts);
      }

      setAllBlogPosts(allPosts);
    } catch { /* ignore */ }
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
      fetchAllBlogPosts(p.blogId);
      fetchScoreData(p.blogId);
      fetchCategory(p.blogId);
      fetchPostAnalysis(p.blogId);
    });
  }, [fetchBlogPosts, fetchAllBlogPosts, fetchScoreData, fetchCategory, fetchPostAnalysis]);

  // 현재 페이지 포스트 자동 순위확인
  useEffect(() => {
    if (!profile || checkingAll) return;
    const all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    if (all.length === 0) return;
    const start = (blogPostsPage - 1) * 10;
    const pagePosts = all.slice(start, start + 10);
    // 아직 확인 안 된 포스트만 체크
    const unchecked = pagePosts.filter(p => !missingResults[p.id]);
    if (unchecked.length === 0) return;
    const checkPage = async () => {
      for (let i = 0; i < unchecked.length; i++) {
        await checkMissing(unchecked[i]);
        if (i < unchecked.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
    };
    const timer = setTimeout(checkPage, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, allBlogPosts, blogPostsPage]);

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
    const posts = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    if (!profile || posts.length === 0) return;
    setCheckingAll(true);
    setCheckProgress({ current: 0, total: posts.length });
    for (let i = 0; i < posts.length; i++) {
      setCheckProgress({ current: i + 1, total: posts.length });
      await checkMissing(posts[i]);
      if (i < posts.length - 1) await new Promise(r => setTimeout(r, 2000));
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

  // ══════════════════════════════════════════════════════════
  // 블로그 지수 = C-Rank (출처 신뢰도) + D.I.A. (문서 품질)
  // ══════════════════════════════════════════════════════════
  const pa = postAnalysis;
  const hasAnalysis = !!pa;

  // ── C-Rank: 블로그(출처) 신뢰도 ──
  // Context(주제 집중도) + Content(콘텐츠 품질) + Chain(소통/반응)

  // C-1. 주제 집중도 — 특정 주제에 얼마나 집중하는지
  const topicFocusScore = (() => {
    // 카테고리가 '기타'가 아니면 주제 설정됨 = 집중도 기본점
    const hasTopic = category !== '기타' ? 20 : 0;
    // 포스팅 분석에서 주제 일관성 추정
    if (!pa) return hasTopic;
    // 1인칭 서술이 높으면 특정 주제에 대한 경험 집중
    const experienceFocus = Math.min(25, pa.metrics.avgPersonalPronounRatio * 800);
    // 원본 이미지 비율 높으면 직접 체험 주제 집중
    const originalFocus = pa.metrics.originalImageRatio * 25;
    // 긴 글 비율 — 깊이 있는 주제 다룸
    const depthFocus = pa.metrics.longPosts * 15;
    // 꾸준한 포스팅 — 주제에 대한 지속적 관심
    const postCount = blogPosts.length >= 10 ? 15 : blogPosts.length >= 5 ? 10 : blogPosts.length >= 2 ? 5 : 0;
    return Math.min(100, Math.round(hasTopic + experienceFocus + originalFocus + depthFocus + postCount));
  })();

  // C-2. 콘텐츠 품질 — 전체 블로그의 콘텐츠 품질 패턴
  const contentQualityScore = pa ? Math.min(100, Math.round(
    // 이미지 포함 글 비율 (max 20)
    pa.metrics.postsWithImages * 20 +
    // 1000자+ 글 비율 (max 20)
    pa.metrics.longPosts * 20 +
    // 소제목 있는 글 비율 (max 15)
    pa.metrics.postsWithHeadings * 15 +
    // 원본사진 있는 글 비율 (max 15)
    pa.metrics.postsWithOriginalImages * 15 +
    // 고유 단어 비율 평균 (max 15)
    (pa.metrics.avgUniqueWordRatio >= 0.6 ? 15 : pa.metrics.avgUniqueWordRatio >= 0.4 ? 10 : 5) +
    // 미디어 포함 글 비율 (max 15)
    pa.metrics.postsWithMedia * 15
  )) : 0;

  // C-Rank 종합 (주제 집중도 + 콘텐츠 품질, Chain/스크랩은 데이터 미제공으로 제외)
  const cRankScore = Math.round((topicFocusScore + contentQualityScore) / 2);

  // ── D.I.A.: 개별 문서 품질 (좋은 문서의 특성 5가지) ──

  // D-1. 경험 정보 — 직접 경험한 솔직한 후기
  const diaExperienceScore = pa ? Math.min(100, Math.round(
    pa.metrics.originalImageRatio * 25 +
    Math.min(25, pa.metrics.avgPersonalPronounRatio * 800) +
    pa.metrics.postsWithOriginalImages * 15 +
    pa.metrics.postsWithMedia * 15 +
    (pa.metrics.avgImageSizeKB >= 500 ? 10 : pa.metrics.avgImageSizeKB >= 200 ? 7 : pa.metrics.avgImageSizeKB >= 100 ? 5 : 0) +
    pa.metrics.postsWithImages * 10
  )) : 0;

  // D-2. 정보 충실성 — 충분한 길이와 상세한 정보
  const diaInfoScore = pa ? Math.min(100, Math.round(
    (pa.metrics.avgCharCount >= 2000 ? 25 : pa.metrics.avgCharCount >= 1500 ? 20 : pa.metrics.avgCharCount >= 1000 ? 15 : pa.metrics.avgCharCount >= 500 ? 8 : 3) +
    (pa.averages.paragraphCount >= 15 ? 20 : pa.averages.paragraphCount >= 10 ? 15 : pa.averages.paragraphCount >= 5 ? 10 : 3) +
    (pa.averages.imageCount >= 8 ? 15 : pa.averages.imageCount >= 5 ? 12 : pa.averages.imageCount >= 3 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.5 ? 15 : pa.metrics.postsWithLists >= 0.2 ? 10 : pa.averages.listItemCount >= 1 ? 5 : 0) +
    Math.min(15, Math.round(pa.metrics.longPosts * 15)) +
    (pa.averages.headingCount >= 3 ? 10 : pa.averages.headingCount >= 1 ? 5 : 0)
  )) : 0;

  // D-3. 독창성 — 복사/짜깁기 없는 독자적 정보
  const diaOriginalityScore = pa ? Math.min(100, Math.round(
    (pa.metrics.avgUniqueWordRatio >= 0.7 ? 30 : pa.metrics.avgUniqueWordRatio >= 0.6 ? 24 : pa.metrics.avgUniqueWordRatio >= 0.5 ? 18 : pa.metrics.avgUniqueWordRatio >= 0.4 ? 12 : 5) +
    pa.metrics.originalImageRatio * 25 +
    Math.min(20, pa.metrics.avgPersonalPronounRatio * 650) +
    (pa.metrics.avgCharCount >= 2000 ? 15 : pa.metrics.avgCharCount >= 1500 ? 12 : pa.metrics.avgCharCount >= 1000 ? 8 : 3) +
    (pa.metrics.avgImageSizeKB >= 300 ? 10 : pa.metrics.avgImageSizeKB >= 100 ? 5 : 0)
  )) : 0;

  // D-4. 신뢰성 — 출처/인용 기반 정보
  const diaReliabilityScore = pa ? Math.min(100, Math.round(
    (pa.averages.linkCount >= 3 ? 30 : pa.averages.linkCount >= 2 ? 22 : pa.averages.linkCount >= 1 ? 15 : 3) +
    (pa.metrics.postsWithQuotations >= 0.5 ? 20 : pa.metrics.postsWithQuotations >= 0.2 ? 12 : pa.averages.quotationCount >= 1 ? 8 : 0) +
    (pa.metrics.originalImageRatio >= 0.5 ? 30 : pa.metrics.originalImageRatio >= 0.3 ? 20 : pa.metrics.originalImageRatio >= 0.1 ? 10 : 3) +
    (pa.metrics.postsWithImages >= 0.8 ? 20 : pa.metrics.postsWithImages >= 0.5 ? 12 : 5)
  )) : 0;

  // D-5. 가독성 — 쉽게 읽고 이해할 수 있는 구성
  const diaReadabilityScore = pa ? Math.min(100, Math.round(
    pa.metrics.postsWithHeadings * 25 +
    (pa.averages.headingCount >= 5 ? 20 : pa.averages.headingCount >= 3 ? 15 : pa.averages.headingCount >= 1 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.3 ? 15 : pa.metrics.postsWithLists >= 0.1 ? 8 : 0) +
    (pa.averages.imageCount >= 3 && pa.averages.imageCount <= 20 ? 20 : pa.averages.imageCount >= 1 ? 10 : 0) +
    (pa.averages.paragraphCount >= 5 ? 10 : pa.averages.paragraphCount >= 3 ? 5 : 0) +
    (pa.metrics.avgCharCount >= 500 ? 10 : pa.metrics.avgCharCount >= 300 ? 5 : 0)
  )) : 0;

  // D.I.A. 종합 (5개 평균)
  const diaScores = [diaExperienceScore, diaInfoScore, diaOriginalityScore, diaReliabilityScore, diaReadabilityScore];
  const diaScore = hasAnalysis ? Math.round(diaScores.reduce((a, b) => a + b, 0) / diaScores.length) : 0;

  // ── D.I.A.+: 문서 패턴 심화 분석 ──

  // D+-1. 문서 구조 패턴 — 소제목/리스트/문단 구성
  const diaPlusStructureScore = pa ? Math.min(100, Math.round(
    pa.metrics.postsWithHeadings * 30 +
    (pa.averages.headingCount >= 5 ? 20 : pa.averages.headingCount >= 3 ? 15 : pa.averages.headingCount >= 1 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.5 ? 20 : pa.metrics.postsWithLists >= 0.2 ? 12 : 0) +
    (pa.averages.paragraphCount >= 10 ? 15 : pa.averages.paragraphCount >= 5 ? 10 : 3) +
    (pa.metrics.longPosts >= 0.8 ? 15 : pa.metrics.longPosts >= 0.5 ? 10 : pa.metrics.longPosts >= 0.2 ? 5 : 0)
  )) : 0;

  // D+-2. 이미지 패턴 — 원본사진/이미지 품질/다양성
  const diaPlusImageScore = pa ? Math.min(100, Math.round(
    pa.metrics.originalImageRatio * 30 +
    (pa.metrics.avgImageSizeKB >= 500 ? 25 : pa.metrics.avgImageSizeKB >= 200 ? 18 : pa.metrics.avgImageSizeKB >= 100 ? 10 : 3) +
    pa.metrics.postsWithOriginalImages * 20 +
    (pa.averages.imageCount >= 5 ? 15 : pa.averages.imageCount >= 3 ? 10 : pa.averages.imageCount >= 1 ? 5 : 0) +
    pa.metrics.postsWithMedia * 10
  )) : 0;

  // D+-3. 진성 정보 — 체험/경험 기반 진짜 정보 (비체험 광고성 필터)
  const diaPlusAuthenticScore = pa ? Math.min(100, Math.round(
    Math.min(30, pa.metrics.avgPersonalPronounRatio * 1000) +
    pa.metrics.originalImageRatio * 25 +
    (pa.metrics.avgUniqueWordRatio >= 0.6 ? 20 : pa.metrics.avgUniqueWordRatio >= 0.4 ? 12 : 5) +
    (pa.metrics.avgCharCount >= 1500 ? 15 : pa.metrics.avgCharCount >= 800 ? 10 : 3) +
    (pa.averages.quotationCount >= 1 ? 10 : 0)
  )) : 0;

  // D.I.A.+ 종합 (3개 평균)
  const diaPlusScores = [diaPlusStructureScore, diaPlusImageScore, diaPlusAuthenticScore];
  const diaPlusScore = hasAnalysis ? Math.round(diaPlusScores.reduce((a, b) => a + b, 0) / diaPlusScores.length) : 0;

  // ── 블로그 지수 종합 = C-Rank(30%) + D.I.A.(35%) + D.I.A.+(35%) ──
  const totalScore = hasAnalysis || blogPosts.length > 0
    ? Math.round(cRankScore * 0.3 + diaScore * 0.35 + diaPlusScore * 0.35)
    : 0;
  const allScores = [cRankScore, diaScore, diaPlusScore];

  function getGrade(score: number) {
    if (score >= 90) return { grade: 'S', color: 'text-accent', bg: 'bg-accent/10' };
    if (score >= 75) return { grade: 'A', color: 'text-up', bg: 'bg-up/10' };
    if (score >= 60) return { grade: 'B', color: 'text-[#2DB400]', bg: 'bg-[#2DB400]/10' };
    if (score >= 40) return { grade: 'C', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { grade: 'D', color: 'text-dim', bg: 'bg-bg' };
  }
  const gradeInfo = getGrade(totalScore);
  latestScoresRef.current = { total: totalScore, scores: allScores, grade: gradeInfo.grade };

  // 발행량 통계 (allBlogPosts 기반 — 최대 30개)
  const publishingStats = (() => {
    const posts = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    if (posts.length === 0) return { daily: 0, weeklyTotal: 0, weeklyAvg: 0, monthlyTotal: 0 };
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let weekCount = 0, monthCount = 0;
    for (const p of posts) {
      const match = p.date.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
      if (match) {
        const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        if (d >= oneWeekAgo) weekCount++;
        if (d >= thirtyDaysAgo) monthCount++;
      }
    }
    return {
      daily: Math.round(monthCount / 30 * 10) / 10,
      weeklyTotal: weekCount,
      weeklyAvg: Math.round(monthCount / 4 * 10) / 10,
      monthlyTotal: monthCount,
    };
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

      {/* ─── 2. 핵심 지표 카드 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatedStatCard
          label="일일 평균 발행"
          value={publishingStats.daily}
          suffix="회/일"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
          color={publishingStats.daily >= 1 ? 'up' : publishingStats.daily >= 0.5 ? 'accent' : 'dim'}
          delay={50}
        />
        <AnimatedStatCard
          label="이번주 발행"
          value={publishingStats.weeklyTotal}
          suffix={`회 (평균 ${publishingStats.weeklyAvg})`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>}
          color={publishingStats.weeklyTotal >= 3 ? 'up' : publishingStats.weeklyTotal >= 1 ? 'accent' : 'dim'}
          delay={100}
        />
        <AnimatedStatCard
          label="한달 발행"
          value={publishingStats.monthlyTotal}
          suffix="회"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>}
          color={publishingStats.monthlyTotal >= 10 ? 'up' : publishingStats.monthlyTotal >= 4 ? 'accent' : 'dim'}
          delay={150}
        />
        <AnimatedStatCard
          label="전체 순위"
          value={scoreData?.rank || 0}
          suffix={scoreData ? `/${scoreData.totalBloggers}` : ''}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          color={scoreData && scoreData.rank <= 10 ? 'gold' : 'accent'}
          delay={200}
        />
        <AnimatedStatCard
          label={`${category} 순위`}
          value={scoreData?.categoryRank || 0}
          suffix={scoreData ? `/${scoreData.categoryTotal}` : ''}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>}
          color={scoreData && scoreData.categoryRank <= 5 ? 'gold' : 'accent'}
          delay={250}
        />
        <AnimatedStatCard
          label="블로그 지수"
          value={totalScore}
          suffix={`(${gradeInfo.grade})`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>}
          color={totalScore >= 60 ? 'up' : totalScore >= 40 ? 'accent' : 'dim'}
          delay={300}
        />
      </div>


      {/* ─── 4. 블로그 방문자수 차트 ─── */}
      {profile && <BlogVisitorChart blogId={profile.blogId} />}

      {/* ─── 5. 포스팅 목록 (10개씩 페이지네이션) + 순위 확인 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[15px]">내 블로그 포스팅</h3>
            <p className="text-[11px] text-dim mt-0.5">
              {(allBlogPosts.length || blogPostsTotal) > 0 ? `총 ${(allBlogPosts.length || blogPostsTotal).toLocaleString()}개의 글` : '포스트 목록을 불러오는 중...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {allBlogPosts.length > 0 && (
              <button onClick={checkAllMissing} disabled={checkingAll}
                className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0">
                {checkingAll ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {checkProgress.current}/{checkProgress.total}
                  </span>
                ) : '전체 순위확인'}
              </button>
            )}
            <a href={`https://blog.naver.com/${profile.blogId}`} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-accent hover:underline font-semibold">블로그 방문 →</a>
          </div>
        </div>

        {allBlogPosts.length === 0 && blogPostsLoading ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : (allBlogPosts.length || blogPosts.length) === 0 ? (
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
                    <th className="text-left px-3 py-3 font-semibold w-36">검색 키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">블로그탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">댓글</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">작성일</th>
                    <th className="text-center px-5 py-3 font-semibold w-16">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {(() => {
                    const all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
                    const start = (blogPostsPage - 1) * 10;
                    return all.slice(start, start + 10);
                  })().map((post, i) => {
                    const mr = missingResults[post.id];
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition group">
                        <td className="px-5 py-3.5 text-dim text-xs">{(blogPostsPage - 1) * 10 + i + 1}</td>
                        <td className="px-3 py-3.5">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[280px]" title={post.title}>
                            {post.title}
                          </a>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-[11px] text-dim bg-bg px-2 py-1 rounded-md block truncate max-w-[140px]" title={extractKeywords(post.title, profile.blogId, profile.displayName)}>
                            {extractKeywords(post.title, profile.blogId, profile.displayName)}
                          </span>
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {mr ? (
                            mr.viewTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {mr.viewTab.rank}위
                              </span>
                            ) : (
                              <span className="text-xs text-dim">-</span>
                            )
                          ) : (
                            <span className="text-[10px] text-dim/50">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {mr ? (
                            mr.blogTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {mr.blogTab.rank}위
                              </span>
                            ) : (
                              <span className="text-xs text-dim">-</span>
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
              {(() => {
                const all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
                const start = (blogPostsPage - 1) * 10;
                return all.slice(start, start + 10);
              })().map((post, i) => {
                const mr = missingResults[post.id];
                return (
                  <div key={post.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{(blogPostsPage - 1) * 10 + i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">{post.title}</a>
                        <span className="text-[10px] text-dim bg-bg px-1.5 py-0.5 rounded mt-1 inline-block">
                          {extractKeywords(post.title, profile.blogId, profile.displayName)}
                        </span>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {mr ? (
                            <>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                mr.viewTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                              }`}>
                                통합 {mr.viewTab.exposed ? `${mr.viewTab.rank}위` : '-'}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                mr.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                              }`}>
                                블로그 {mr.blogTab.exposed ? `${mr.blogTab.rank}위` : '-'}
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
                            ) : mr ? '재확인' : '순위확인'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {(() => {
              const total = allBlogPosts.length > 0 ? allBlogPosts.length : blogPostsTotal;
              const totalPages = Math.ceil(total / 10);
              if (totalPages <= 1) return null;
              return (
                <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                  <button onClick={() => setBlogPostsPage(p => Math.max(1, p - 1))}
                    disabled={blogPostsPage <= 1}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                    ← 이전
                  </button>
                  <span className="text-xs text-dim px-2">{blogPostsPage} / {totalPages}</span>
                  <button onClick={() => setBlogPostsPage(p => Math.min(totalPages, p + 1))}
                    disabled={blogPostsPage >= totalPages}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                    다음 →
                  </button>
                </div>
              );
            })()}
          </>
        )}
      </GlassCard>

    </div>
  );
}
