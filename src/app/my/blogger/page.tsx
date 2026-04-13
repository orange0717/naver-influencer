'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';
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
  searchVolume?: number;
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

// 네이버 공식 블로그 주제 분류
const CATEGORIES = [
  // 엔터테인먼트·예술
  '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송',
  // 생활·노하우·쇼핑
  '일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
  // 취미·여가·여행
  '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
  // 지식·동향
  'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문',
  // 기타
  '주제선택안함',
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

// 포스팅 제목에서 핵심 키워드 추출 (복합어 분해 + 접미어 추출)
function extractKeywords(title: string, blogId: string, displayName?: string): string[] {
  let cleaned = title;
  // 1. blogId + displayName + 닉네임 변형 제거
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) {
    removePatterns.push(displayName);
    if (displayName.length >= 4) {
      removePatterns.push(displayName.slice(0, Math.ceil(displayName.length / 2)));
    }
  }
  const nameSuffixes = ['단상', '도서관', '지음', '블로그', '일기', '기록', '이야기', '스토리'];
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(p, 'gi'), ' ');
  }
  for (const s of nameSuffixes) {
    if (displayName && cleaned.toLowerCase().includes(displayName.slice(0, 3).toLowerCase() + s)) {
      cleaned = cleaned.replace(new RegExp(displayName.slice(0, 3) + s, 'gi'), ' ');
    }
  }
  // 2. 괄호 제거
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // 3. 특수문자 제거 + 분리 (복합어는 분리하지 않고 원형 유지)
  const rawWords = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

  // 3.5. 의로 끝나는 단어 + 짧은 다음 단어 합치기 (책 제목 보존: 장사의 신 → 장사의신)
  const mergedWords: string[] = [];
  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    const next = rawWords[i + 1];
    if (/[가-힣]의$/.test(word) && next && /^[가-힣]{1,3}$/.test(next)) {
      mergedWords.push(word + next);
      i++;
    } else {
      mergedWords.push(word);
    }
  }

  // 4. 키워드 추출 + 접미어 분해
  const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
  const result: string[] = [];
  const seen = new Set<string>();

  function add(kw: string) {
    const k = kw.trim();
    if (k.length >= 2 && !seen.has(k) && !stop.has(k)) {
      result.push(k);
      seen.add(k);
    }
  }

  // 접미어 키워드 패턴 (의미 있는 검색어가 되는 것만)
  const kwSuffixes = ['글귀', '명대사', '명언'];

  for (const raw of mergedWords) {
    if (raw.length < 2 || /^\d+$/.test(raw) || stop.has(raw)) continue;

    if (/^[가-힣]{4,}$/.test(raw)) {
      // 원형 보존 (책 제목 등 분리하지 않음)
      add(raw);

      // 접미어 추출 (짧고좋은글귀 → 좋은글귀, 글귀)
      for (const suf of kwSuffixes) {
        if (raw.endsWith(suf) && raw.length > suf.length + 1) {
          const prefix = raw.slice(0, -suf.length);
          for (const p of ['고', '과', '와']) {
            const pidx = prefix.lastIndexOf(p);
            if (pidx >= 1) {
              const mid = prefix.slice(pidx + 1) + suf;
              if (mid.length >= 3) add(mid);
            }
          }
          add(suf);
        }
      }
    } else {
      // 짧은 단어: 조사 제거 후 추가
      const stripped = /^[가-힣]+$/.test(raw) ? stripParticles(raw) : raw;
      if (stripped.length >= 2 && !stop.has(stripped) && !/^[a-zA-Z]$/.test(stripped)) {
        add(stripped);
      }
    }
  }

  return result.slice(0, 6);
}

export default function BloggerDashboard() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [customProfile, setCustomProfile] = useState<{ displayName?: string; imageUrl?: string }>({});
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [allBlogPosts, setAllBlogPosts] = useState<BlogPost[]>([]); // 통계용 전체 포스트
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [blogPostsPage, setBlogPostsPage] = useState(1);
  const [blogPostsLoading, setBlogPostsLoading] = useState(false);
  const [postsPerPage, setPostsPerPage] = useState(10);
  const [missingResults, setMissingResults] = useState<Record<string, MissingResult>>({});
  const [checkingMissing, setCheckingMissing] = useState<string>('');
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  const [postFilter, setPostFilter] = useState<'all' | 'missing'>('all');
  const [scoreData, setScoreData] = useState<BlogScoreData | null>(null);
  const [category, setCategory] = useState('기타');
  const [suggestedCategory, setSuggestedCategory] = useState('기타');
  const [showCategorySelect, setShowCategorySelect] = useState(false);
  const [postAnalysis, setPostAnalysis] = useState<{ metrics: BlogAnalysisMetrics; averages: BlogAnalysisAverages } | null>(null);
  const [blogStats, setBlogStats] = useState<{ totalVisitor: number; todayVisitor: number; subscriberCount: number; postCount: number; isOfficialBlog: boolean } | null>(null);
  const [visitorData, setVisitorData] = useState<{ avgVisitors: number; trend: number }>({ avgVisitors: 0, trend: 0 });

  // 점수 계산용 ref
  const latestScoresRef = useRef({ total: 0, scores: [0, 0, 0, 0, 0, 0], grade: 'D' });

  const fetchBlogPosts = useCallback(async (blogId: string, page: number = 1) => {
    setBlogPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${postsPerPage}`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
        setBlogPostsTotal(data.totalCount || 0);
        setBlogPostsPage(page);
      }
    } catch { /* ignore */ }
    finally { setBlogPostsLoading(false); }
  }, [postsPerPage]);

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

  const fetchBlogStats = useCallback(async (blogId: string) => {
    try {
      const [statsRes, visitorsRes] = await Promise.all([
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(blogId)}`),
        fetch(`/api/blog/visitors?blogId=${encodeURIComponent(blogId)}&days=30`),
      ]);
      if (statsRes.ok) {
        const data = await statsRes.json();
        setBlogStats(data);
      }
      if (visitorsRes.ok) {
        const data = await visitorsRes.json();
        setVisitorData({ avgVisitors: data.avgVisitors || 0, trend: data.trend || 0 });
      }
    } catch { /* ignore */ }
  }, []);

  const saveScoreToServer = useCallback(async () => {
    if (!profile) return;
    const { total } = latestScoresRef.current;
    if (total === 0) return;
    try {
      await fetch('/api/blog/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blog_id: profile.blogId, blog_name: profile.displayName,
          total_score: total, grade: '',
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
      // 키워드순위 페이지의 결과 불러오기 (postId::keyword → postId별 최고 순위)
      try {
        const savedRankings = localStorage.getItem(`ninfl_ranking_results_${p.blogId}`);
        if (savedRankings) {
          const parsed = JSON.parse(savedRankings) as Record<string, MissingResult>;
          const byPost: Record<string, MissingResult> = {};
          for (const [key, result] of Object.entries(parsed)) {
            const postId = key.includes('::') ? key.split('::')[0] : key;
            const existing = byPost[postId];
            if (!existing) {
              byPost[postId] = { ...result };
            } else {
              // 각 탭별로 더 좋은 순위 채택
              if (result.viewTab.exposed && (!existing.viewTab.exposed || (result.viewTab.rank && existing.viewTab.rank && result.viewTab.rank < existing.viewTab.rank))) {
                existing.viewTab = result.viewTab;
              }
              if (result.blogTab.exposed && (!existing.blogTab.exposed || (result.blogTab.rank && existing.blogTab.rank && result.blogTab.rank < existing.blogTab.rank))) {
                existing.blogTab = result.blogTab;
              }
              if (result.searchVolume && (!existing.searchVolume || result.searchVolume > existing.searchVolume)) {
                existing.searchVolume = result.searchVolume;
              }
            }
          }
          setMissingResults(prev => ({ ...byPost, ...prev }));
        }
      } catch { /* ignore */ }
      fetchBlogPosts(p.blogId, 1);
      fetchAllBlogPosts(p.blogId);
      fetchScoreData(p.blogId);
      fetchCategory(p.blogId);
      fetchPostAnalysis(p.blogId);
      fetchBlogStats(p.blogId);
    });
  }, [fetchBlogPosts, fetchAllBlogPosts, fetchScoreData, fetchCategory, fetchPostAnalysis, fetchBlogStats]);

  // 전체 포스트 자동 순위확인 (로드 완료 시)
  useEffect(() => {
    if (!profile || checkingAll) return;
    const posts = blogPosts.length > 0 ? blogPosts : [];
    if (posts.length === 0) return;
    const unchecked = posts.filter(p => !missingResults[p.id]);
    if (unchecked.length === 0) return;
    const autoCheck = async () => {
      setCheckingAll(true);
      setCheckProgress({ current: 0, total: unchecked.length });
      for (let i = 0; i < unchecked.length; i++) {
        setCheckProgress({ current: i + 1, total: unchecked.length });
        await checkMissing(unchecked[i]);
        if (i < unchecked.length - 1) await new Promise(r => setTimeout(r, 1500));
      }
      setCheckingAll(false);
      setCheckProgress({ current: 0, total: 0 });
      saveScoreToServer();
    };
    const timer = setTimeout(autoCheck, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, blogPosts.length]);


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
    // 상위노출 확률을 서버에 저장
    saveScoreToServer();
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
  // 평균순위 = 모든 키워드의 순위 합산 / 노출된 키워드 수
  // 키워드순위 페이지의 개별 키워드 결과를 직접 사용
  // ══════════════════════════════════════════════════════════
  const blogScoreCalc = (() => {
    const posts = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    const publicPosts = posts.filter(p => p.isPublic !== false);

    // 키워드 레벨 결과 가져오기 (postId::keyword 형식)
    let kwResults: Record<string, MissingResult> = {};
    try {
      const blogId = profile?.blogId;
      if (blogId) {
        const raw = localStorage.getItem(`ninfl_ranking_results_${blogId}`);
        if (raw) kwResults = JSON.parse(raw);
      }
    } catch { /* ignore */ }

    // 키워드 레벨 데이터가 있으면 모든 키워드 합산
    const kwEntries = Object.entries(kwResults);
    const hasKwData = kwEntries.length > 0;

    // 포스트 레벨 데이터도 확인
    const checked = publicPosts.filter(p => missingResults[p.id]);
    if (!hasKwData && checked.length === 0) {
      return { score: 0, exposed: 0, blogExposed: 0, viewExposed: 0, blogAvgRank: 0, viewAvgRank: 0, total: 0, publicTotal: publicPosts.length, totalKeywords: 0, hasData: false };
    }

    let blogExposedCount = 0;
    let viewExposedCount = 0;
    let blogRankSum = 0;
    let viewRankSum = 0;
    let totalKeywords = 0;

    if (hasKwData) {
      // 키워드 레벨: 모든 키워드의 순위를 개별 합산
      for (const [, result] of kwEntries) {
        totalKeywords++;
        if (result.blogTab.exposed && result.blogTab.rank) {
          blogExposedCount++;
          blogRankSum += result.blogTab.rank;
        }
        if (result.viewTab.exposed && result.viewTab.rank) {
          viewExposedCount++;
          viewRankSum += result.viewTab.rank;
        }
      }
    } else {
      // 폴백: 포스트 레벨 데이터 사용
      for (const p of checked) {
        const mr = missingResults[p.id];
        totalKeywords++;
        if (mr.blogTab.exposed && mr.blogTab.rank) {
          blogExposedCount++;
          blogRankSum += mr.blogTab.rank;
        }
        if (mr.viewTab.exposed && mr.viewTab.rank) {
          viewExposedCount++;
          viewRankSum += mr.viewTab.rank;
        }
      }
    }

    const exposedCount = Math.max(blogExposedCount, viewExposedCount);

    return {
      score: 0,
      exposed: exposedCount,
      blogExposed: blogExposedCount,
      viewExposed: viewExposedCount,
      blogAvgRank: blogExposedCount > 0 ? +(blogRankSum / blogExposedCount).toFixed(1) : 0,
      viewAvgRank: viewExposedCount > 0 ? +(viewRankSum / viewExposedCount).toFixed(1) : 0,
      total: hasKwData ? kwEntries.length : checked.length,
      publicTotal: publicPosts.length,
      totalKeywords,
      hasData: true,
    };
  })();

  const totalScore = blogScoreCalc.hasData ? blogScoreCalc.score : (scoreData?.total_score || 0);
  latestScoresRef.current = { total: totalScore, scores: [0, 0, 0, 0, 0, 0], grade: '' };

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
        isOfficialBlog={blogStats?.isOfficialBlog}
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

      {/* ─── 2. 방문자 + 노출 평균순위 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AnimatedStatCard label="TODAY 방문자" value={blogStats?.todayVisitor || 0} suffix="명" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} color="accent" delay={0} />
        <AnimatedStatCard label="일일 평균 방문자" value={visitorData.avgVisitors} suffix={visitorData.trend !== 0 ? `명 ${visitorData.trend > 0 ? '▲' : '▼'}${Math.abs(visitorData.trend)}%` : '명'} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>} color={visitorData.trend > 0 ? 'up' : visitorData.trend < 0 ? 'down' : 'accent'} delay={50} />
        <AnimatedStatCard label="통합검색 평균순위" value={blogScoreCalc.viewAvgRank || 0} suffix="위" placeholder={checkingAll ? '검사중...' : '—'} description={blogScoreCalc.hasData ? `${blogScoreCalc.totalKeywords}개 키워드 중 ${blogScoreCalc.viewExposed}개 노출` : ''} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>} color={blogScoreCalc.viewAvgRank && blogScoreCalc.viewAvgRank <= 5 ? 'up' : blogScoreCalc.viewAvgRank && blogScoreCalc.viewAvgRank <= 15 ? 'accent' : 'dim'} delay={100} />
        <AnimatedStatCard label="블로그탭 평균순위" value={blogScoreCalc.blogAvgRank || 0} suffix="위" placeholder={checkingAll ? '검사중...' : '—'} description={blogScoreCalc.hasData ? `${blogScoreCalc.totalKeywords}개 키워드 중 ${blogScoreCalc.blogExposed}개 노출` : ''} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} color={blogScoreCalc.blogAvgRank && blogScoreCalc.blogAvgRank <= 5 ? 'up' : blogScoreCalc.blogAvgRank && blogScoreCalc.blogAvgRank <= 15 ? 'accent' : 'dim'} delay={150} />
      </div>

      {/* ─── 3. 발행량 + 이웃 + 순위 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <AnimatedStatCard label="이웃수" value={blogStats?.subscriberCount || 0} suffix="명" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} color="accent" delay={0} />
        <AnimatedStatCard label="이번주 발행" value={publishingStats.weeklyTotal} suffix="회" description={(() => { const now = new Date(); const w = new Date(now.getTime() - 7*24*60*60*1000); return `${w.getMonth()+1}/${w.getDate()} ~ ${now.getMonth()+1}/${now.getDate()}`; })()} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} color={publishingStats.weeklyTotal >= 3 ? 'up' : publishingStats.weeklyTotal >= 1 ? 'accent' : 'dim'} delay={50} />
        <AnimatedStatCard label="한달 발행" value={publishingStats.monthlyTotal} suffix="회" description={(() => { const now = new Date(); const m = new Date(now.getTime() - 30*24*60*60*1000); return `${m.getMonth()+1}/${m.getDate()} ~ ${now.getMonth()+1}/${now.getDate()}`; })()} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} color={publishingStats.monthlyTotal >= 10 ? 'up' : publishingStats.monthlyTotal >= 4 ? 'accent' : 'dim'} delay={100} />
        <AnimatedStatCard label="전체 순위" value={0} placeholder="개발중" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>} color="dim" delay={150} />
        <AnimatedStatCard label={`${category} 순위`} value={0} placeholder="개발중" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>} color="dim" delay={200} />
      </div>


      {/* ─── 5. 블로그 방문자수 차트 ─── */}
      {profile && <BlogVisitorChart blogId={profile.blogId} />}

      {/* ─── 6. 포스팅 목록 + 순위 확인 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-[15px]">내 블로그 포스팅</h3>
            <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
              {[10, 30, 60, 90, 180].map(n => (
                <button key={n} onClick={() => { setPostsPerPage(n); setBlogPostsPage(1); if (profile) fetchBlogPosts(profile.blogId, 1); }}
                  className={`px-2.5 py-1 font-semibold transition cursor-pointer ${postsPerPage === n ? 'bg-accent text-white' : 'text-dim hover:bg-bg'}`}>
                  {n}개
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(missingResults).length > 0 && (
              <div className="flex rounded-lg border border-border overflow-hidden text-[11px] shrink-0">
                <button onClick={() => { setPostFilter('all'); setBlogPostsPage(1); }}
                  className={`px-3 py-1.5 font-semibold transition cursor-pointer ${postFilter === 'all' ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'}`}>
                  전체
                </button>
                <button onClick={() => { setPostFilter('missing'); setBlogPostsPage(1); }}
                  className={`px-3 py-1.5 font-semibold transition cursor-pointer ${postFilter === 'missing' ? 'bg-down text-white' : 'text-dim hover:bg-surface-hover'}`}>
                  누락 {(() => {
                    const all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
                    const cnt = all.filter(p => {
                      const mr = missingResults[p.id];
                      return mr && (!mr.viewTab.exposed || !mr.blogTab.exposed);
                    }).length;
                    return cnt > 0 ? cnt : '';
                  })()}
                </button>
              </div>
            )}
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
                    <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">블로그탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">댓글</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">작성일</th>
                    <th className="text-center px-5 py-3 font-semibold w-16">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {(() => {
                    let all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
                    if (postFilter === 'missing') {
                      all = all.filter(p => {
                        const mr = missingResults[p.id];
                        return mr && (!mr.viewTab.exposed || !mr.blogTab.exposed);
                      });
                    }
                    const start = (blogPostsPage - 1) * postsPerPage;
                    return all.slice(start, start + postsPerPage);
                  })().map((post, i) => {
                    const mr = missingResults[post.id];
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition group">
                        <td className="px-5 py-3.5 text-dim text-xs">{(blogPostsPage - 1) * postsPerPage + i + 1}</td>
                        <td className="px-3 py-3.5">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[400px]" title={post.title}>
                            {post.title}
                          </a>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {extractKeywords(post.title, profile.blogId, profile.displayName).map((kw, ki) => (
                              <span key={ki} className="text-[10px] text-dim bg-bg px-1.5 py-0.5 rounded">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {mr ? (
                            mr.viewTab.exposed ? (
                              <span className="text-[11px] font-bold text-up">노출</span>
                            ) : (
                              <span className="text-[11px] font-bold text-down">누락</span>
                            )
                          ) : (
                            <span className="text-[10px] text-dim/50">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {mr ? (
                            mr.blogTab.exposed ? (
                              <span className="text-[11px] font-bold text-up">노출</span>
                            ) : (
                              <span className="text-[11px] font-bold text-down">누락</span>
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
                let all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
                if (postFilter === 'missing') {
                  all = all.filter(p => {
                    const mr = missingResults[p.id];
                    return mr && (!mr.viewTab.exposed || !mr.blogTab.exposed);
                  });
                }
                return all.slice(0, 10);
              })().map((post, i) => {
                const mr = missingResults[post.id];
                return (
                  <div key={post.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{(blogPostsPage - 1) * postsPerPage + i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">{post.title}</a>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {extractKeywords(post.title, profile.blogId, profile.displayName).map((kw, ki) => (
                            <span key={ki} className="text-[10px] text-dim bg-bg px-1.5 py-0.5 rounded">
                              {kw}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {mr ? (
                            <>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                mr.viewTab.exposed ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                              }`}>
                                통합 {mr.viewTab.exposed ? '노출' : '누락'}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                mr.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                              }`}>
                                블로그 {mr.blogTab.exposed ? '노출' : '누락'}
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

            {/* 페이지네이션 + 키워드순위 링크 */}
            {(() => {
              let list = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
              if (postFilter === 'missing') {
                list = list.filter(p => {
                  const mr = missingResults[p.id];
                  return mr && (!mr.viewTab.exposed || !mr.blogTab.exposed);
                });
              }
              const total = postFilter === 'missing' ? list.length : (allBlogPosts.length > 0 ? allBlogPosts.length : blogPostsTotal);
              const totalPages = Math.ceil(total / postsPerPage);
              return (
                <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between">
                  {totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setBlogPostsPage(p => Math.max(1, p - 1))}
                        disabled={blogPostsPage <= 1}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30">
                        이전
                      </button>
                      <span className="text-xs text-dim">{blogPostsPage} / {totalPages}</span>
                      <button onClick={() => setBlogPostsPage(p => Math.min(totalPages, p + 1))}
                        disabled={blogPostsPage >= totalPages}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-hover transition cursor-pointer disabled:opacity-30">
                        다음
                      </button>
                    </div>
                  ) : <div />}
                  <Link href="/my/keyword-ranking" className="text-xs text-accent font-semibold hover:underline">
                    키워드순위 →
                  </Link>
                </div>
              );
            })()}
          </>
        )}
      </GlassCard>

    </div>
  );
}
