'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';
import DashboardCard from '@/components/dashboard/DashboardCard';
import BlogVisitorChart from '@/components/dashboard/BlogVisitorChart';
import { useSavedKeywords } from '@/hooks/useSavedKeywords';
import { rowsToCsv, downloadCsvInBrowser, todayStamp } from '@/lib/csv';
import { filterMissing, countMissing } from '@/lib/missing-rate';
import type { BloggerProfile, BlogPost, MissingResult, BlogScoreData, BlogAnalysisMetrics, BlogAnalysisAverages } from './BlogAnalysisSection.helpers';
import {
  CATEGORIES,
  CHECK_FRESH_MS,
  fetchWithTimeout,
  fetchAiBriefingState,
  aggregateByPost,
  getProfileFromApi,
  extractKeywords,
  GuestBlogAnalysis,
} from './BlogAnalysisSection.helpers';

export default function BlogAnalysisSection() {
  // 저장된 키워드 토글
  const { savedSet, toggle: toggleSaved } = useSavedKeywords();

  /** null=인증 확인 중, false=비로그인(Empty State), true=로그인(실데이터) */
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [customProfile, setCustomProfile] = useState<{ displayName?: string; imageUrl?: string }>({});
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [allBlogPosts, setAllBlogPosts] = useState<BlogPost[]>([]); // 통계용 전체 포스트
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [blogPostsPage, setBlogPostsPage] = useState(1);
  const [blogPostsLoading, setBlogPostsLoading] = useState(false);
  const [allBlogPostsLoading, setAllBlogPostsLoading] = useState(false);
  const [postsPerPage, setPostsPerPage] = useState(10);
  const [missingResults, setMissingResults] = useState<Record<string, MissingResult>>({});
  // 키워드순위 결과 (postId::keyword) — DB(keyword_rank_lookups)에서 복원, blogScoreCalc 합산용
  const [kwRankingResults, setKwRankingResults] = useState<Record<string, MissingResult>>({});
  const [checkingMissing, setCheckingMissing] = useState<string>('');
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0, failed: 0 });
  const [postFilter, setPostFilter] = useState<'all' | 'missing'>('all');
  const [scoreData, setScoreData] = useState<BlogScoreData | null>(null);
  const [category, setCategory] = useState('기타');
  const [suggestedCategory, setSuggestedCategory] = useState('기타');
  const [showCategorySelect, setShowCategorySelect] = useState(false);
  const [postAnalysis, setPostAnalysis] = useState<{ metrics: BlogAnalysisMetrics; averages: BlogAnalysisAverages } | null>(null);
  const [blogStats, setBlogStats] = useState<{ totalVisitor: number; todayVisitor: number; subscriberCount: number; postCount: number; isOfficialBlog: boolean } | null>(null);
  const [visitorData, setVisitorData] = useState<{ avgVisitors: number; totalVisitors: number; trend: number; collectedDays: number; lastCollectedDate: string | null }>({ avgVisitors: 0, totalVisitors: 0, trend: 0, collectedDays: 0, lastCollectedDate: null });

  // AI 브리핑·AI탭 상태 — AiBriefingSection과 동일 queryKey를 사용해 캐시를 공유(중복 요청 없음)
  const { data: aiBriefingByKeyword } = useQuery({
    queryKey: ['ai-briefing-state', profile?.blogId],
    queryFn: () => fetchAiBriefingState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 60 * 1000,
  });
  const aiBriefingByPost = useMemo(() => aggregateByPost(aiBriefingByKeyword ?? {}), [aiBriefingByKeyword]);

  // 점수 계산용 ref
  const latestScoresRef = useRef({ total: 0, scores: [0, 0, 0, 0, 0, 0], grade: 'D' });

  const fetchBlogPosts = useCallback(async (blogId: string, page: number = 1) => {
    setBlogPostsLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${postsPerPage}`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
        setBlogPostsTotal(data.totalCount || 0);
        setBlogPostsPage(page);
      }
    } catch { /* ignore */ }
    finally { setBlogPostsLoading(false); }
  }, [postsPerPage]);

  // 전체 포스트 로드 (모든 페이지를 동시 배치로 병렬 조회 — 포스트가 많을수록 순차 조회는
  // 페이지 수만큼 왕복이 누적되어 계정이 커질수록 로딩이 계속 느려지는 원인이었다)
  const fetchAllBlogPosts = useCallback(async (blogId: string) => {
    setAllBlogPostsLoading(true);
    try {
      const perPage = 30;
      const concurrency = 5;

      // 첫 페이지로 총 개수 확인
      const firstRes = await fetchWithTimeout(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=1&count=${perPage}`);
      if (!firstRes.ok) return;
      const firstData = await firstRes.json();
      const totalCount = firstData.totalCount || 0;
      setBlogPostsTotal(totalCount);

      const totalPages = Math.ceil(totalCount / perPage);
      const pagePosts: BlogPost[][] = new Array(totalPages);
      pagePosts[0] = firstData.posts || [];

      // 나머지 페이지를 concurrency개씩 묶어 병렬 조회 (순서는 배열 인덱스로 보존)
      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < remainingPages.length; i += concurrency) {
        const batch = remainingPages.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(async page => {
            const res = await fetchWithTimeout(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${perPage}`);
            if (!res.ok) return;
            const data = await res.json();
            pagePosts[page - 1] = data.posts || [];
          })
        );
      }

      setAllBlogPosts(pagePosts.flat().filter(Boolean));
    } catch { /* ignore */ }
    finally { setAllBlogPostsLoading(false); }
  }, []);

  const fetchScoreData = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/blog/score?blogId=${encodeURIComponent(blogId)}`);
      if (res.ok) {
        const data = await res.json();
        setScoreData(data);
        setCategory(data.category || '기타');
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCategory = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/blog/category?blogId=${encodeURIComponent(blogId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.current) setCategory(data.current);
        if (data.suggested) setSuggestedCategory(data.suggested);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchPostAnalysis = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/blog/analyze?blogId=${encodeURIComponent(blogId)}&count=10`);
      if (res.ok) {
        const data = await res.json();
        if (data.analyzedCount > 0) {
          setPostAnalysis({ metrics: data.metrics, averages: data.averages });
        }
      }
    } catch { /* ignore */ }
  }, []);

  const fetchBlogStats = useCallback(async (blogId: string) => {
    // 두 호출을 독립적으로 처리 — 한쪽이 느리거나 실패해도(Promise.all 이었다면
    // 전체가 함께 실패해 정상 응답까지 버려짐) 나머지 하나는 정상적으로 반영되도록 allSettled 사용
    const [statsResult, visitorsResult] = await Promise.allSettled([
      fetchWithTimeout(`/api/blog/stats?blogId=${encodeURIComponent(blogId)}`),
      fetchWithTimeout(`/api/blog/visitors?blogId=${encodeURIComponent(blogId)}&days=30`),
    ]);

    if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
      try {
        const data = await statsResult.value.json();
        setBlogStats(data);
      } catch (e) { console.error('[fetchBlogStats] stats 파싱 실패:', e); }
    } else if (statsResult.status === 'rejected') {
      console.error('[fetchBlogStats] /api/blog/stats 요청 실패:', statsResult.reason);
    } else if (!statsResult.value.ok) {
      console.error('[fetchBlogStats] /api/blog/stats 응답 오류:', statsResult.value.status);
    }

    if (visitorsResult.status === 'fulfilled' && visitorsResult.value.ok) {
      try {
        const data = await visitorsResult.value.json();
        setVisitorData({
          avgVisitors: data.avgVisitors || 0,
          totalVisitors: data.totalVisitors || 0,
          trend: data.trend || 0,
          collectedDays: data.collectedDays || 0,
          lastCollectedDate: data.lastCollectedDate || null,
        });
      } catch (e) { console.error('[fetchBlogStats] visitors 파싱 실패:', e); }
    } else if (visitorsResult.status === 'rejected') {
      console.error('[fetchBlogStats] /api/blog/visitors 요청 실패:', visitorsResult.reason);
    } else if (!visitorsResult.value.ok) {
      console.error('[fetchBlogStats] /api/blog/visitors 응답 오류:', visitorsResult.value.status);
    }
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
    getProfileFromApi().then(async p => {
      if (!p) {
        // 비로그인 게스트: 데이터 API 호출 없이 Empty State만 렌더
        setIsLoggedIn(false);
        return;
      }
      setIsLoggedIn(true);
      const customProfileKey = `blogger_custom_profile_${p.accountId || 'anon'}_${p.blogId}`;
      const customData = localStorage.getItem(customProfileKey);
      if (customData) {
        try {
          const parsed = JSON.parse(customData);
          if (parsed && typeof parsed === 'object') {
            setCustomProfile(parsed);
            if (parsed.displayName) p = { ...p, displayName: parsed.displayName };
            if (parsed.imageUrl) p = { ...p, imageUrl: parsed.imageUrl };
          } else {
            localStorage.removeItem(customProfileKey);
          }
        } catch {
          localStorage.removeItem(customProfileKey);
        }
      }
      setProfile(p);

      // 아래 두 복원 호출은 서로 의존관계가 없고, 본문 데이터 호출(포스트/점수/카테고리 등)과도
      // 무관하므로 순차 await로 묶지 않고 전부 동시에 발사한다 (직렬 대기 시간 제거)
      const restoreKeywordRankingState = async () => {
        try {
          const res = await fetchWithTimeout(`/api/my/keyword-ranking-state?blogId=${encodeURIComponent(p!.blogId)}`);
          if (!res.ok) return;
          const data = await res.json();
          const parsed = (data?.rankingResults ?? {}) as Record<string, MissingResult>;
          setKwRankingResults(parsed);
          const byPost: Record<string, MissingResult> = {};
          for (const [key, result] of Object.entries(parsed)) {
            const r = result as MissingResult;
            if (!r || !r.viewTab || !r.blogTab) continue;
            const postId = key.includes('::') ? key.split('::')[0] : key;
            const existing = byPost[postId];
            if (!existing) {
              byPost[postId] = { ...r };
            } else {
              if (r.viewTab.exposed && (!existing.viewTab.exposed || (r.viewTab.rank && existing.viewTab.rank && r.viewTab.rank < existing.viewTab.rank))) {
                existing.viewTab = r.viewTab;
              }
              if (r.blogTab.exposed && (!existing.blogTab.exposed || (r.blogTab.rank && existing.blogTab.rank && r.blogTab.rank < existing.blogTab.rank))) {
                existing.blogTab = r.blogTab;
              }
              if (r.searchVolume && (!existing.searchVolume || r.searchVolume > existing.searchVolume)) {
                existing.searchVolume = r.searchVolume;
              }
            }
          }
          setMissingResults(prev => ({ ...byPost, ...prev }));
        } catch { /* ignore */ }
      };

      const restorePostMissingState = async () => {
        try {
          const missingRes = await fetchWithTimeout(`/api/my/post-missing-state?blogId=${encodeURIComponent(p!.blogId)}`);
          if (!missingRes.ok) return;
          const data = await missingRes.json();
          const stored = (data?.results ?? {}) as Record<string, MissingResult>;
          setMissingResults(prev => ({ ...prev, ...stored }));
        } catch { /* ignore */ }
      };

      restoreKeywordRankingState();
      restorePostMissingState();
      fetchBlogPosts(p.blogId, 1);
      fetchAllBlogPosts(p.blogId);
      fetchScoreData(p.blogId);
      fetchCategory(p.blogId);
      fetchPostAnalysis(p.blogId);
      fetchBlogStats(p.blogId);
    });
  }, [fetchBlogPosts, fetchAllBlogPosts, fetchScoreData, fetchCategory, fetchPostAnalysis, fetchBlogStats]);

  const handleProfileChange = useCallback((data: { displayName?: string; imageUrl?: string }) => {
    setCustomProfile(prev => {
      const updated = { ...prev, ...data };
      if (profile) {
        const key = `blogger_custom_profile_${profile.accountId || 'anon'}_${profile.blogId}`;
        localStorage.setItem(key, JSON.stringify(updated));
      }
      return updated;
    });
    setProfile(prev => prev ? { ...prev, ...data } : prev);
  }, [profile]);

  // 포스트 1개 검사 → 결과 즉시 반영 (서버가 DB에도 즉시 저장). 오류 시 최대 3회 재시도.
  const checkMissing = async (post: BlogPost): Promise<'ok' | 'failed'> => {
    if (!profile) return 'failed';
    setCheckingMissing(post.id);
    const MAX_ATTEMPTS = 3;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch('/api/blog/check-missing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blogId: profile.blogId, postTitle: post.title, postId: post.id }),
          });
          if (res.ok) {
            const data = await res.json();
            setMissingResults(prev => ({
              ...prev,
              [post.id]: { ...data, status: 'ok', checkedAt: new Date().toISOString() },
            }));
            return 'ok';
          }
        } catch { /* 네트워크 오류 — 재시도 */ }
        if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 800 * attempt));
      }
    } finally {
      setCheckingMissing('');
    }

    // 재시도 소진 → "검사 실패" 상태로 저장하고 다음 포스트로 계속 진행
    setMissingResults(prev => ({
      ...prev,
      [post.id]: {
        blogTab: prev[post.id]?.blogTab ?? { exposed: null, rank: null },
        viewTab: prev[post.id]?.viewTab ?? { exposed: null, rank: null },
        status: 'failed',
        checkedAt: new Date().toISOString(),
      },
    }));
    try {
      await fetch('/api/my/post-missing-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postId: post.id, postTitle: post.title }),
      });
    } catch { /* ignore */ }
    return 'failed';
  };

  // 전체 포스팅을 하나씩 순차 검사 → 검사 직후 즉시 저장 → 모두 끝나면 누락률 계산
  // 이미 신선한(24시간 이내) 성공 결과가 있는 포스트는 건너뛰어 불필요한 재검사를 줄인다.
  const checkMissingForCount = async (count: number) => {
    const all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    if (!profile || all.length === 0) return;
    const posts = count === 0 ? all : all.slice(0, count);
    setCheckingAll(true);
    setCheckProgress({ current: 0, total: posts.length, failed: 0 });
    const now = Date.now();
    let failedCount = 0;
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const existing = missingResults[post.id];
      const isFresh = existing?.status === 'ok' && !!existing.checkedAt
        && (now - new Date(existing.checkedAt).getTime()) < CHECK_FRESH_MS;
      if (!isFresh) {
        const result = await checkMissing(post);
        if (result === 'failed') failedCount++;
        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
      setCheckProgress({ current: i + 1, total: posts.length, failed: failedCount });
    }
    setCheckingAll(false);
    setCheckProgress({ current: 0, total: 0, failed: 0 });
    saveScoreToServer();
  };

  const checkAllMissing = () => checkMissingForCount(0);

  const downloadPostsCsv = () => {
    if (!profile) return;
    let posts = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    if (postFilter === 'missing') {
      posts = filterMissing(posts, missingResults);
    }
    if (posts.length === 0) return;
    const headers = ['번호', '제목', 'URL', '작성일', '댓글수', '통합검색 노출', '통합검색 순위', '블로그탭 노출', '블로그탭 순위'];
    const rows = posts.map((p, i) => {
      const mr = missingResults[p.id];
      const view = mr?.viewTab;
      const blog = mr?.blogTab;
      return [
        i + 1,
        p.title,
        p.url,
        p.date,
        p.commentCount,
        view ? (view.exposed ? '노출' : '누락') : '',
        view?.rank ?? '',
        blog ? (blog.exposed ? '노출' : '누락') : '',
        blog?.rank ?? '',
      ];
    });
    const csv = rowsToCsv(headers, rows);
    const filterTag = postFilter === 'missing' ? '_누락' : '';
    downloadCsvInBrowser(`내블로그포스팅_${profile.blogId}${filterTag}_${todayStamp()}.csv`, csv);
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
  const blogScoreCalc = useMemo(() => {
    const posts = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    const publicPosts = posts.filter(p => p.isPublic !== false);

    // 키워드 레벨 결과 (postId::keyword 형식) — DB에서 복원된 state 사용
    const kwEntries = Object.entries(kwRankingResults);
    const hasKwData = kwEntries.length > 0;

    // 포스트 레벨 데이터도 확인
    const checked = publicPosts.filter(p => missingResults[p.id]);
    if (!hasKwData && checked.length === 0) {
      return { score: 0, exposed: 0, blogExposed: 0, viewExposed: 0, bothExposed: 0, anyMissing: 0, blogAvgRank: 0, viewAvgRank: 0, total: 0, publicTotal: publicPosts.length, totalKeywords: 0, hasData: false };
    }

    let blogExposedCount = 0;
    let viewExposedCount = 0;
    let bothExposedCount = 0;
    let anyMissingCount = 0;
    let blogRankSum = 0;
    let viewRankSum = 0;
    let totalKeywords = 0;

    const entries = hasKwData
      ? kwEntries.map(([, r]) => r)
      : checked.map(p => missingResults[p.id]);

    // 누락 = 통합검색 OR 블로그탭 둘 중 하나라도 미노출 (필터 버튼과 동일 정의)
    for (const result of entries) {
      totalKeywords++;
      const viewOk = result.viewTab.exposed;
      const blogOk = result.blogTab.exposed;

      if (viewOk && blogOk) bothExposedCount++;
      if (!viewOk || !blogOk) anyMissingCount++;

      if (blogOk && result.blogTab.rank) {
        blogExposedCount++;
        blogRankSum += result.blogTab.rank;
      }
      if (viewOk && result.viewTab.rank) {
        viewExposedCount++;
        viewRankSum += result.viewTab.rank;
      }
    }

    return {
      score: 0,
      exposed: bothExposedCount,
      blogExposed: blogExposedCount,
      viewExposed: viewExposedCount,
      bothExposed: bothExposedCount,
      anyMissing: anyMissingCount,
      blogAvgRank: blogExposedCount > 0 ? +(blogRankSum / blogExposedCount).toFixed(1) : 0,
      viewAvgRank: viewExposedCount > 0 ? +(viewRankSum / viewExposedCount).toFixed(1) : 0,
      total: hasKwData ? kwEntries.length : checked.length,
      publicTotal: publicPosts.length,
      totalKeywords,
      hasData: true,
    };
  }, [profile?.blogId, allBlogPosts, blogPosts, missingResults, kwRankingResults]);

  const totalScore = blogScoreCalc.hasData ? blogScoreCalc.score : (scoreData?.total_score || 0);

  // ══════════════════════════════════════════════════════════
  // 현재 화면 슬라이스 기반 누락 계산
  //   filteredList: 전체(또는 누락 필터) 적용된 페이지네이션 전 리스트
  //   currentViewList: 현재 페이지·postsPerPage 만큼 잘라낸 화면 표시 리스트
  //   missingInView: 화면에 보이는 항목 중 누락(통합 OR 블로그탭 누락) 객체 배열
  // ══════════════════════════════════════════════════════════
  const filteredList = useMemo(() => {
    const all = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    if (postFilter === 'missing') return filterMissing(all, missingResults);
    return all;
  }, [allBlogPosts, blogPosts, postFilter, missingResults]);

  const currentViewList = useMemo(() => {
    const start = (blogPostsPage - 1) * postsPerPage;
    return filteredList.slice(start, start + postsPerPage);
  }, [filteredList, blogPostsPage, postsPerPage]);

  const missingInView = useMemo(
    () => filterMissing(currentViewList, missingResults),
    [currentViewList, missingResults]
  );

  // ══════════════════════════════════════════════════════════
  // 누락율 슬라이스 선택 (최신 N개 기준)
  // ══════════════════════════════════════════════════════════
  const [missingRateSlice, setMissingRateSlice] = useState<10 | 30 | 60 | 180 | 0>(10);

  const missingRateSlicePosts = useMemo(() => {
    const posts = allBlogPosts.length > 0 ? allBlogPosts : blogPosts;
    return missingRateSlice === 0 ? posts : posts.slice(0, missingRateSlice);
  }, [allBlogPosts, blogPosts, missingRateSlice]);

  const missingCountForSlice = useMemo(
    () => countMissing(missingRateSlicePosts, missingResults),
    [missingRateSlicePosts, missingResults]
  );

  const checkedCountForSlice = useMemo(
    () => missingRateSlicePosts.filter(p => missingResults[p.id]).length,
    [missingRateSlicePosts, missingResults]
  );

  const missingRateForSlice = useMemo(() => {
    if (checkedCountForSlice === 0) return 0;
    return Math.round((missingCountForSlice / checkedCountForSlice) * 100);
  }, [missingCountForSlice, checkedCountForSlice]);

  useEffect(() => {
    latestScoresRef.current = { total: totalScore, scores: [0, 0, 0, 0, 0, 0], grade: '' };
  }, [totalScore]);

  // 발행량 통계 (allBlogPosts 기반 — 최대 30개)
  const publishingStats = useMemo(() => {
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
  }, [allBlogPosts, blogPosts]);

  if (isLoggedIn === null) return null; // 인증 확인 중
  if (isLoggedIn === false) return <GuestBlogAnalysis />;
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

      {/* ─── 1. 프로필 헤더 (카테고리 선택을 하단 슬롯으로 통합해 카드 1개로 축소) ─── */}
      <div className="space-y-3">
      <h2 className="text-sm font-bold text-text px-1">블로그 정보</h2>
      <ProfileHeader
        displayName={customProfile.displayName || profile.displayName}
        imageUrl={customProfile.imageUrl || profile.imageUrl}
        blogId={profile.blogId}
        type={profile.isInfluencer ? 'influencer' : 'blogger'}
        subscribed={!!profile.subscriptionPlan}
        subscriptionPlan={profile.subscriptionPlan}
        subscriptionExpiresAt={profile.subscriptionExpiresAt}
        editable={true}
        onProfileChange={handleProfileChange}
        isOfficialBlog={blogStats?.isOfficialBlog}
      >
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
          <div className="flex flex-wrap gap-1.5 mt-2">
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
      </ProfileHeader>
      </div>

      {/* ─── 2. 대시보드 카드 ─── */}
      {/* TODAY 방문자·30일 방문자수·이웃수는 위쪽 KPI 요약(BlogDashboardKpiBar)과 중복되어 제거 (2026-07-15) */}
      <DashboardCard
        title="발행 · 순위 통계"
        headerRight={
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-dim bg-border/30">
            전체 순위 · {category} 순위 Coming Soon
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatedStatCard size="stat" label="이번주 발행" value={publishingStats.weeklyTotal} suffix="회" description={(() => { const now = new Date(); const w = new Date(now.getTime() - 7*24*60*60*1000); return `${w.getMonth()+1}/${w.getDate()} ~ ${now.getMonth()+1}/${now.getDate()}`; })()} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} color={publishingStats.weeklyTotal >= 3 ? 'up' : publishingStats.weeklyTotal >= 1 ? 'accent' : 'dim'} delay={150} />
          <AnimatedStatCard size="stat" label="한달 발행" value={publishingStats.monthlyTotal} suffix="회" description={(() => { const now = new Date(); const m = new Date(now.getTime() - 30*24*60*60*1000); return `${m.getMonth()+1}/${m.getDate()} ~ ${now.getMonth()+1}/${now.getDate()}`; })()} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} color={publishingStats.monthlyTotal >= 10 ? 'up' : publishingStats.monthlyTotal >= 4 ? 'accent' : 'dim'} delay={200} />
          {/* 2행: 순위 + 누락율 */}
          <AnimatedStatCard size="stat" label="통합검색 평균순위" value={blogScoreCalc.viewAvgRank || 0} suffix="위" placeholder={checkingAll ? '검사중...' : '—'} description={blogScoreCalc.hasData ? `노출 ${blogScoreCalc.viewExposed} / 누락 ${blogScoreCalc.totalKeywords - blogScoreCalc.viewExposed} (${blogScoreCalc.totalKeywords}개 키워드)` : '키워드순위에서 확인 필요'} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>} color={blogScoreCalc.viewAvgRank && blogScoreCalc.viewAvgRank <= 5 ? 'up' : blogScoreCalc.viewAvgRank && blogScoreCalc.viewAvgRank <= 15 ? 'accent' : 'dim'} delay={250} />
          <AnimatedStatCard size="stat" label="블로그탭 평균순위" value={blogScoreCalc.blogAvgRank || 0} suffix="위" placeholder={checkingAll ? '검사중...' : '—'} description={blogScoreCalc.hasData ? `노출 ${blogScoreCalc.blogExposed} / 누락 ${blogScoreCalc.totalKeywords - blogScoreCalc.blogExposed} (${blogScoreCalc.totalKeywords}개 키워드)` : '키워드순위에서 확인 필요'} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} color={blogScoreCalc.blogAvgRank && blogScoreCalc.blogAvgRank <= 5 ? 'up' : blogScoreCalc.blogAvgRank && blogScoreCalc.blogAvgRank <= 15 ? 'accent' : 'dim'} delay={300} />
          {/* 미노출 — 아래 누락율 카드와 동일 슬라이스(missingRateSlice) 공유, 체크 전/후 구분 위해 커스텀 카드 사용 */}
          <div className="h-[182px] flex flex-col bg-surface rounded-2xl border border-border p-4 shadow-xs transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:border-down/40">
            <div className="flex items-start justify-between mb-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#FAF4F2] text-down flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </div>
            </div>
            <p className="stat-title mb-1 shrink-0">미노출</p>
            <p className="stat-desc line-clamp-2 min-h-[28px] shrink-0">
              {checkedCountForSlice === 0 ? ' ' : `${checkedCountForSlice}개 확인 중 ${missingRateForSlice}%`}
            </p>
            <div className="mt-auto flex items-baseline gap-1.5 pt-2 shrink-0">
              <span className={`stat-value stat-value-stat font-rank truncate ${checkedCountForSlice === 0 ? 'text-dim' : missingCountForSlice === 0 ? 'text-up' : 'text-down'}`}>
                {checkedCountForSlice === 0 ? '—' : `${missingCountForSlice}개`}
              </span>
            </div>
          </div>
          {/* 누락율 — 슬라이스 탭 (AnimatedStatCard 공용 컴포넌트를 쓰지 않는 커스텀 카드라 사이즈·톤을 수동으로 맞춤, 높이는 stat 카드와 동일하게 유지) */}
          <div className="h-[182px] flex flex-col bg-surface rounded-2xl border border-border p-4 shadow-xs transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:border-down/40">
            <div className="flex items-start justify-between mb-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#FAF4F2] text-down flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
            </div>
            <p className="stat-title mb-1 shrink-0">누락율</p>
            <div className="flex rounded-md border border-border overflow-hidden text-[10px] shrink-0">
              {([10, 30, 60, 180, 0] as const).map(n => (
                <button key={n} onClick={() => setMissingRateSlice(n)}
                  className={`flex-1 py-1 font-semibold transition cursor-pointer ${missingRateSlice === n ? 'bg-accent text-white' : 'text-dim hover:bg-bg'}`}>
                  {n === 0 ? '전체' : `${n}개`}
                </button>
              ))}
            </div>
            <div className="mt-auto flex items-baseline gap-1.5 pt-2 shrink-0">
              <span className={`stat-value stat-value-stat font-rank truncate ${checkedCountForSlice === 0 ? 'text-dim' : missingRateForSlice <= 30 ? 'text-up' : missingRateForSlice <= 60 ? 'text-accent' : 'text-down'}`}>
                {checkedCountForSlice === 0 ? '—' : `${missingRateForSlice}%`}
              </span>
              <span className="text-[10px] text-dim/60 truncate">
                {checkedCountForSlice === 0 ? '누락 확인 후 표시' : `${checkedCountForSlice}개 중 ${missingCountForSlice}개 누락`}
              </span>
            </div>
          </div>
          <AnimatedStatCard
            size="stat"
            label="품질점수"
            value={scoreData?.total_score ?? 0}
            suffix="점"
            placeholder="—"
            description={scoreData ? `${scoreData.grade}등급 · 전체 ${scoreData.totalBloggers}명 중 ${scoreData.rank}위` : '분석 중'}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            color={!scoreData ? 'dim' : scoreData.total_score >= 80 ? 'up' : scoreData.total_score >= 50 ? 'accent' : 'down'}
            delay={350}
          />
        </div>
      </DashboardCard>


      {/* ─── 6. 블로그 방문자수 차트 ─── */}
      {profile && <BlogVisitorChart blogId={profile.blogId} />}

      {/* ─── 7. 포스팅 목록 + 순위 확인 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-[15px]">내 포스팅 · 블로그 누락</h3>
            <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
              {[10, 30, 60, 90, 180].map(n => (
                <button key={n} onClick={() => {
                  setPostsPerPage(n);
                  setBlogPostsPage(1);
                  if (profile) fetchBlogPosts(profile.blogId, 1);
                  if (!checkingAll) checkMissingForCount(n);
                }}
                  className={`px-2.5 py-1 font-semibold transition cursor-pointer ${postsPerPage === n ? 'bg-accent text-white' : 'text-dim hover:bg-bg'}`}>
                  {n}개
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-border overflow-hidden text-[11px] shrink-0">
              <button onClick={() => { setPostFilter('all'); setBlogPostsPage(1); }}
                className={`px-3 py-1.5 font-semibold transition cursor-pointer ${postFilter === 'all' ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'}`}>
                전체
              </button>
              <button onClick={() => { setPostFilter('missing'); setBlogPostsPage(1); }}
                className={`px-3 py-1.5 font-semibold transition cursor-pointer ${postFilter === 'missing' ? 'bg-down text-white' : 'text-dim hover:bg-surface-hover'}`}>
                누락 {missingInView.length > 0 ? missingInView.length : ''}
              </button>
            </div>
            {allBlogPosts.length > 0 && (
              <button onClick={checkAllMissing} disabled={checkingAll}
                className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0">
                {checkingAll ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {checkProgress.current}/{checkProgress.total}
                    {checkProgress.failed > 0 ? ` (실패 ${checkProgress.failed})` : ''}
                  </span>
                ) : '전체 누락율 확인'}
              </button>
            )}
            <button onClick={downloadPostsCsv}
              disabled={(allBlogPosts.length || blogPosts.length) === 0}
              title="현재 필터가 적용된 포스팅 목록을 CSV로 저장"
              className="px-3 py-2 border border-border text-text font-semibold rounded-xl hover:bg-surface-hover transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs shrink-0 flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              CSV 저장
            </button>
            <a href={`https://blog.naver.com/${profile.blogId}`} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-accent hover:underline font-semibold">블로그 방문 →</a>
          </div>
        </div>

        {allBlogPosts.length === 0 && (blogPostsLoading || allBlogPostsLoading) ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : (allBlogPosts.length || blogPosts.length) === 0 ? (
          <div className="text-center py-10 text-dim text-sm">포스트가 없습니다.</div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[920px] table-fixed">
                <colgroup>
                  <col style={{ width: '3%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-center px-3 py-3 font-semibold">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold">블로그탭</th>
                    <th className="text-center px-3 py-3 font-semibold">색인</th>
                    <th className="text-center px-3 py-3 font-semibold">AI브리핑</th>
                    <th className="text-center px-3 py-3 font-semibold">AI탭</th>
                    <th className="text-center px-3 py-3 font-semibold">조회</th>
                    <th className="text-center px-3 py-3 font-semibold">댓글</th>
                    <th className="text-center px-3 py-3 font-semibold">작성일</th>
                    <th className="text-center px-3 py-3 font-semibold">확인</th>
                    <th className="text-center px-5 py-3 font-semibold">상세분석</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {currentViewList.map((post, i) => {
                    const mr = missingResults[post.id];
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition group">
                        <td className="px-5 py-4 text-dim text-xs">{(blogPostsPage - 1) * postsPerPage + i + 1}</td>
                        <td className="px-3 py-4">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[400px]" title={post.title}>
                            {post.title}
                          </a>
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            <span className="text-[10px] text-dim font-semibold mr-1">키워드 저장:</span>
                            {extractKeywords(post.title, profile.blogId, profile.displayName).map((kw, ki) => {
                              const isSaved = savedSet.has(kw);
                              return (
                                <button
                                  key={ki}
                                  type="button"
                                  onClick={() => toggleSaved(kw)}
                                  title={isSaved ? '저장됨 - 클릭하여 해제' : `'${kw}' 저장하기`}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                    isSaved
                                      ? 'bg-accent text-white border-accent font-semibold'
                                      : 'text-text bg-bg border-accent/30 hover:bg-accent/10 hover:border-accent/60'
                                  }`}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24"
                                    fill={isSaved ? 'currentColor' : 'none'}
                                    stroke="currentColor" strokeWidth="2.2">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                  </svg>
                                  {kw}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="text-center px-3 py-4">
                          {mr?.viewTab.exposed === true ? (
                            <span className="text-[11px] font-bold text-up">노출</span>
                          ) : mr?.viewTab.exposed === false ? (
                            <span className="text-[11px] font-bold text-down">누락</span>
                          ) : mr?.status === 'failed' ? (
                            <span className="text-[10px] font-bold text-accent">실패</span>
                          ) : (
                            <span className="text-[10px] text-dim/50">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-4">
                          {mr?.blogTab.exposed === true ? (
                            <span className="text-[11px] font-bold text-up">노출</span>
                          ) : mr?.blogTab.exposed === false ? (
                            <span className="text-[11px] font-bold text-down">누락</span>
                          ) : mr?.status === 'failed' ? (
                            <span className="text-[10px] font-bold text-accent">실패</span>
                          ) : (
                            <span className="text-[10px] text-dim/50">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-4">
                          <span className="text-[10px] text-dim/50" title="색인 여부 확인 기능은 준비 중입니다">—</span>
                        </td>
                        <td className="text-center px-3 py-4">
                          {(() => {
                            const ai = aiBriefingByPost[post.id];
                            if (!ai || ai.briefing === 'unchecked') return <span className="text-[10px] text-dim/50">—</span>;
                            return ai.briefing === 'cited'
                              ? <span className="text-[11px] font-bold text-up">인용</span>
                              : <span className="text-[11px] font-bold text-down">미인용</span>;
                          })()}
                        </td>
                        <td className="text-center px-3 py-4">
                          {(() => {
                            const ai = aiBriefingByPost[post.id];
                            if (!ai || ai.tab === 'unchecked') return <span className="text-[10px] text-dim/50">—</span>;
                            return ai.tab === 'exposed'
                              ? <span className="text-[11px] font-bold text-up">노출</span>
                              : <span className="text-[11px] font-bold text-down">미노출</span>;
                          })()}
                        </td>
                        <td className="text-center px-3 py-4 text-xs text-dim">
                          {typeof post.viewCount === 'number' ? post.viewCount.toLocaleString() : '—'}
                        </td>
                        <td className="text-center px-3 py-4">
                          {post.commentCount > 0 ? (
                            <span className="text-xs text-accent font-semibold">{post.commentCount}</span>
                          ) : <span className="text-xs text-dim">—</span>}
                        </td>
                        <td className="text-center px-3 py-4 text-xs text-dim whitespace-nowrap">{post.date}</td>
                        <td className="text-center px-3 py-4">
                          <button onClick={() => checkMissing(post)}
                            disabled={checkingMissing === post.id || checkingAll}
                            className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50">
                            {checkingMissing === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : mr?.status === 'failed' ? '재시도' : mr ? '재확인' : '확인'}
                          </button>
                        </td>
                        <td className="text-center px-5 py-4">
                          <Link href={`/my/post-analysis?blogId=${encodeURIComponent(profile.blogId)}&postId=${encodeURIComponent(post.id)}`}
                            className="text-[11px] text-accent hover:underline font-semibold">
                            상세분석
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {currentViewList.map((post, i) => {
                const mr = missingResults[post.id];
                return (
                  <div key={post.id} className="px-4 py-4">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{(blogPostsPage - 1) * postsPerPage + i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">{post.title}</a>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className="text-[10px] text-dim font-semibold mr-1">키워드 저장:</span>
                          {extractKeywords(post.title, profile.blogId, profile.displayName).map((kw, ki) => {
                            const isSaved = savedSet.has(kw);
                            return (
                              <button
                                key={ki}
                                type="button"
                                onClick={() => toggleSaved(kw)}
                                title={isSaved ? '저장됨 - 클릭하여 해제' : `'${kw}' 저장하기`}
                                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                  isSaved
                                    ? 'bg-accent text-white border-accent font-semibold'
                                    : 'text-text bg-bg border-accent/30 hover:bg-accent/10 hover:border-accent/60'
                                }`}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24"
                                  fill={isSaved ? 'currentColor' : 'none'}
                                  stroke="currentColor" strokeWidth="2.2">
                                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                                {kw}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {mr && (mr.viewTab.exposed !== null || mr.blogTab.exposed !== null) ? (
                            <>
                              {mr.viewTab.exposed !== null && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  mr.viewTab.exposed ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                                }`}>
                                  통합 {mr.viewTab.exposed ? '노출' : '누락'}
                                </span>
                              )}
                              {mr.blogTab.exposed !== null && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  mr.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                                }`}>
                                  블로그 {mr.blogTab.exposed ? '노출' : '누락'}
                                </span>
                              )}
                            </>
                          ) : mr?.status === 'failed' ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">검사 실패</span>
                          ) : null}
                          {(() => {
                            const ai = aiBriefingByPost[post.id];
                            if (!ai || ai.briefing === 'unchecked') return null;
                            return (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ai.briefing === 'cited' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                                AI브리핑 {ai.briefing === 'cited' ? '인용' : '미인용'}
                              </span>
                            );
                          })()}
                          {(() => {
                            const ai = aiBriefingByPost[post.id];
                            if (!ai || ai.tab === 'unchecked') return null;
                            return (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ai.tab === 'exposed' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                                AI탭 {ai.tab === 'exposed' ? '노출' : '미노출'}
                              </span>
                            );
                          })()}
                          <span className="text-[11px] text-dim">{post.date}</span>
                          {typeof post.viewCount === 'number' && <span className="text-[11px] text-dim">조회 {post.viewCount.toLocaleString()}</span>}
                          {post.commentCount > 0 && <span className="text-[11px] text-accent">댓글 {post.commentCount}</span>}
                          <button onClick={() => checkMissing(post)}
                            disabled={checkingMissing === post.id || checkingAll}
                            className="text-[10px] text-accent cursor-pointer disabled:opacity-50">
                            {checkingMissing === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : mr?.status === 'failed' ? '재시도' : mr ? '재확인' : '순위확인'}
                          </button>
                          <Link href={`/my/post-analysis?blogId=${encodeURIComponent(profile.blogId)}&postId=${encodeURIComponent(post.id)}`}
                            className="text-[10px] text-accent font-semibold hover:underline">
                            상세분석 →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 + 키워드순위 링크 */}
            {(() => {
              const total = postFilter === 'missing'
                ? filteredList.length
                : (allBlogPosts.length > 0 ? allBlogPosts.length : blogPostsTotal);
              const totalPages = Math.ceil(total / postsPerPage);
              return (
                <div className="px-5 py-3 border-t border-border/50 flex flex-col items-center gap-2">
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
                  ) : null}
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
