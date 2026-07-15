'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';
import BlogVisitorChart from '@/components/dashboard/BlogVisitorChart';
import { useSavedKeywords } from '@/hooks/useSavedKeywords';
import { rowsToCsv, downloadCsvInBrowser, todayStamp } from '@/lib/csv';
import { filterMissing, calculateMissingRate, countMissing } from '@/lib/missing-rate';

interface BloggerProfile {
  blogId: string;
  /** 로그인 계정 식별자 — 동일 blogId를 다른 계정이 조회해도 로컬 캐시가 섞이지 않도록 키에 포함 */
  accountId?: string;
  displayName: string;
  isInfluencer: boolean;
  imageUrl?: string;
  needsBlogId?: boolean;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  viewCount?: number;
  date: string;
  isPublic: boolean;
}

interface AiBriefingResult {
  hasAiBriefing: boolean | null;
  exposed: boolean | null;
  hasAiTab: boolean | null;
  tabExposed: boolean | null;
}

async function fetchAiBriefingState(blogId: string): Promise<Record<string, AiBriefingResult>> {
  const res = await fetch(`/api/my/ai-briefing-state?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('AI 브리핑 상태 조회 실패');
  const data = await res.json();
  return (data?.briefingResults ?? {}) as Record<string, AiBriefingResult>;
}

/** "postId::keyword" 키 결과를 postId 단위로 합산 — 하나라도 인용/노출이면 해당 포스트는 인용/노출로 표시 */
function aggregateByPost(byKeyword: Record<string, AiBriefingResult>): Record<string, { briefing: 'cited' | 'notCited' | 'unchecked'; tab: 'exposed' | 'notExposed' | 'unchecked' }> {
  const byPost: Record<string, { briefingChecked: boolean; briefingCited: boolean; tabChecked: boolean; tabExposed: boolean }> = {};
  for (const [key, r] of Object.entries(byKeyword)) {
    const postId = key.includes('::') ? key.split('::')[0] : key;
    const entry = byPost[postId] ??= { briefingChecked: false, briefingCited: false, tabChecked: false, tabExposed: false };
    if (r.exposed !== null) {
      entry.briefingChecked = true;
      if (r.exposed) entry.briefingCited = true;
    }
    if (r.tabExposed !== null) {
      entry.tabChecked = true;
      if (r.tabExposed) entry.tabExposed = true;
    }
  }
  const result: Record<string, { briefing: 'cited' | 'notCited' | 'unchecked'; tab: 'exposed' | 'notExposed' | 'unchecked' }> = {};
  for (const [postId, e] of Object.entries(byPost)) {
    result[postId] = {
      briefing: !e.briefingChecked ? 'unchecked' : e.briefingCited ? 'cited' : 'notCited',
      tab: !e.tabChecked ? 'unchecked' : e.tabExposed ? 'exposed' : 'notExposed',
    };
  }
  return result;
}

interface MissingResult {
  blogTab: { exposed: boolean | null; rank: number | null };
  viewTab: { exposed: boolean | null; rank: number | null };
  searchVolume?: number;
  status?: 'ok' | 'failed';
  checkedAt?: string | null;
}

// 검사 결과 캐시 신선도 — 이 시간 이내에 성공(ok) 검사된 포스트는 재검사를 건너뛴다 (새 글/수정 글만 재검사)
const CHECK_FRESH_MS = 24 * 60 * 60 * 1000;

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
    // Supabase 세션 토큰을 Bearer로 전달
    let headers: Record<string, string> = {};
    try {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers = { Authorization: `Bearer ${session.access_token}` };
      }
    } catch { /* ignore */ }

    const res = await fetch('/api/auth/me', { headers });
    const data = await res.json();
    const sub = {
      subscriptionPlan: data.subscriptionPlan ?? null,
      subscriptionExpiresAt: data.subscriptionExpiresAt ?? null,
    };
    const accountId: string | undefined = data.authId || data.id || undefined;
    if (data.type === 'unified' && (data.blogId || data.id)) {
      return { blogId: data.blogId || data.id, accountId, displayName: data.name || data.blogId || data.id, isInfluencer: true, ...sub };
    }
    if (data.type === 'blogger' && data.id) {
      return { blogId: data.id, accountId, displayName: data.name || data.id, isInfluencer: false, ...sub };
    }
    if (data.type === 'influencer' && data.id) {
      return { blogId: data.blogId || data.id, accountId, displayName: data.name || data.id, isInfluencer: true, needsBlogId: !data.blogId, ...sub };
    }

    // API 인증 실패 시 URL의 blogId 파라미터 폴백
    const urlParams = new URLSearchParams(window.location.search);
    const blogIdParam = urlParams.get('blogId');
    if (blogIdParam) {
      return { blogId: blogIdParam, displayName: blogIdParam, isInfluencer: false };
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
    // 두 호출을 독립적으로 처리 — 한쪽이 느리거나 실패해도(Promise.all 이었다면
    // 전체가 함께 실패해 정상 응답까지 버려짐) 나머지 하나는 정상적으로 반영되도록 allSettled 사용
    const [statsResult, visitorsResult] = await Promise.allSettled([
      fetch(`/api/blog/stats?blogId=${encodeURIComponent(blogId)}`),
      fetch(`/api/blog/visitors?blogId=${encodeURIComponent(blogId)}&days=30`),
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
      // 키워드순위 결과를 DB에서 불러오기 (postId::keyword → postId별 최고 순위)
      try {
        const res = await fetch(`/api/my/keyword-ranking-state?blogId=${encodeURIComponent(p.blogId)}`);
        if (res.ok) {
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
        }
      } catch { /* ignore */ }
      // 포스트별 개별 누락 검사 결과 복원 (DB — 실시간 데이터 기준, 새로고침해도 소실되지 않음)
      try {
        const missingRes = await fetch(`/api/my/post-missing-state?blogId=${encodeURIComponent(p.blogId)}`);
        if (missingRes.ok) {
          const data = await missingRes.json();
          const stored = (data?.results ?? {}) as Record<string, MissingResult>;
          setMissingResults(prev => ({ ...prev, ...stored }));
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
  //   missingRateInView: (missingInView.length / currentViewList.length) * 100 정수
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

  const missingRateInView = useMemo(
    () => calculateMissingRate(currentViewList, missingResults),
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

      {/* ─── 1. 프로필 헤더 ─── */}
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

      {/* ─── 2. 대시보드 카드 ─── */}
      {/* TODAY 방문자·30일 방문자수·이웃수는 위쪽 KPI 요약(BlogDashboardKpiBar)과 중복되어 제거 (2026-07-15) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AnimatedStatCard label="이번주 발행" value={publishingStats.weeklyTotal} suffix="회" description={(() => { const now = new Date(); const w = new Date(now.getTime() - 7*24*60*60*1000); return `${w.getMonth()+1}/${w.getDate()} ~ ${now.getMonth()+1}/${now.getDate()}`; })()} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} color={publishingStats.weeklyTotal >= 3 ? 'up' : publishingStats.weeklyTotal >= 1 ? 'accent' : 'dim'} delay={150} />
        <AnimatedStatCard label="한달 발행" value={publishingStats.monthlyTotal} suffix="회" description={(() => { const now = new Date(); const m = new Date(now.getTime() - 30*24*60*60*1000); return `${m.getMonth()+1}/${m.getDate()} ~ ${now.getMonth()+1}/${now.getDate()}`; })()} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} color={publishingStats.monthlyTotal >= 10 ? 'up' : publishingStats.monthlyTotal >= 4 ? 'accent' : 'dim'} delay={200} />
        {/* 2행: 순위 + 누락율 */}
        <AnimatedStatCard label="통합검색 평균순위" value={blogScoreCalc.viewAvgRank || 0} suffix="위" placeholder={checkingAll ? '검사중...' : '—'} description={blogScoreCalc.hasData ? `노출 ${blogScoreCalc.viewExposed} / 누락 ${blogScoreCalc.totalKeywords - blogScoreCalc.viewExposed} (${blogScoreCalc.totalKeywords}개 키워드)` : '키워드순위에서 확인 필요'} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>} color={blogScoreCalc.viewAvgRank && blogScoreCalc.viewAvgRank <= 5 ? 'up' : blogScoreCalc.viewAvgRank && blogScoreCalc.viewAvgRank <= 15 ? 'accent' : 'dim'} delay={250} />
        <AnimatedStatCard label="블로그탭 평균순위" value={blogScoreCalc.blogAvgRank || 0} suffix="위" placeholder={checkingAll ? '검사중...' : '—'} description={blogScoreCalc.hasData ? `노출 ${blogScoreCalc.blogExposed} / 누락 ${blogScoreCalc.totalKeywords - blogScoreCalc.blogExposed} (${blogScoreCalc.totalKeywords}개 키워드)` : '키워드순위에서 확인 필요'} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>} color={blogScoreCalc.blogAvgRank && blogScoreCalc.blogAvgRank <= 5 ? 'up' : blogScoreCalc.blogAvgRank && blogScoreCalc.blogAvgRank <= 15 ? 'accent' : 'dim'} delay={300} />
        {/* 누락율 — 슬라이스 탭 */}
        <div className={`bg-surface rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-500 ease-out`}>
          <div className="flex items-start justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-down/10 text-down flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
          </div>
          <p className="text-[11px] text-dim mb-1">누락율</p>
          <div className="flex rounded-md border border-border overflow-hidden text-[10px] mb-2">
            {([10, 30, 60, 180, 0] as const).map(n => (
              <button key={n} onClick={() => setMissingRateSlice(n)}
                className={`flex-1 py-0.5 font-semibold transition cursor-pointer ${missingRateSlice === n ? 'bg-accent text-white' : 'text-dim hover:bg-bg'}`}>
                {n === 0 ? '전체' : `${n}개`}
              </button>
            ))}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black font-rank ${checkedCountForSlice === 0 ? 'text-dim' : missingRateForSlice <= 30 ? 'text-up' : missingRateForSlice <= 60 ? 'text-accent' : 'text-down'}`}>
              {checkedCountForSlice === 0 ? '—' : `${missingRateForSlice}%`}
            </span>
          </div>
          <p className="text-[10px] text-dim/60 mt-0.5">
            {checkedCountForSlice === 0 ? '누락 확인 후 표시' : `검사 ${checkedCountForSlice}개 중 ${missingCountForSlice}개 누락`}
          </p>
        </div>
        <AnimatedStatCard label="전체 순위" value={0} placeholder="개발중" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>} color="dim" delay={400} />
        <AnimatedStatCard label={`${category} 순위`} value={0} placeholder="개발중" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>} color="dim" delay={450} />
      </div>


      {/* ─── 6. 블로그 방문자수 차트 ─── */}
      {profile && <BlogVisitorChart blogId={profile.blogId} />}

      {/* ─── 7. 포스팅 목록 + 순위 확인 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2">
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
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">블로그탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">색인</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">AI브리핑</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">AI탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">조회</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">댓글</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">작성일</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">확인</th>
                    <th className="text-center px-5 py-3 font-semibold w-20">상세분석</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {currentViewList.map((post, i) => {
                    const mr = missingResults[post.id];
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition group">
                        <td className="px-5 py-3.5 text-dim text-xs">{(blogPostsPage - 1) * postsPerPage + i + 1}</td>
                        <td className="px-3 py-3.5">
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
                        <td className="text-center px-3 py-3.5">
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
                        <td className="text-center px-3 py-3.5">
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
                        <td className="text-center px-3 py-3.5">
                          <span className="text-[10px] text-dim/50" title="색인 여부 확인 기능은 준비 중입니다">—</span>
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {(() => {
                            const ai = aiBriefingByPost[post.id];
                            if (!ai || ai.briefing === 'unchecked') return <span className="text-[10px] text-dim/50">—</span>;
                            return ai.briefing === 'cited'
                              ? <span className="text-[11px] font-bold text-up">인용</span>
                              : <span className="text-[11px] font-bold text-down">미인용</span>;
                          })()}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {(() => {
                            const ai = aiBriefingByPost[post.id];
                            if (!ai || ai.tab === 'unchecked') return <span className="text-[10px] text-dim/50">—</span>;
                            return ai.tab === 'exposed'
                              ? <span className="text-[11px] font-bold text-up">노출</span>
                              : <span className="text-[11px] font-bold text-down">미노출</span>;
                          })()}
                        </td>
                        <td className="text-center px-3 py-3.5 text-xs text-dim">
                          {typeof post.viewCount === 'number' ? post.viewCount.toLocaleString() : '—'}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.commentCount > 0 ? (
                            <span className="text-xs text-accent font-semibold">{post.commentCount}</span>
                          ) : <span className="text-xs text-dim">—</span>}
                        </td>
                        <td className="text-right px-3 py-3.5 text-xs text-dim">{post.date}</td>
                        <td className="text-center px-3 py-3.5">
                          <button onClick={() => checkMissing(post)}
                            disabled={checkingMissing === post.id || checkingAll}
                            className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50">
                            {checkingMissing === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : mr?.status === 'failed' ? '재시도' : mr ? '재확인' : '확인'}
                          </button>
                        </td>
                        <td className="text-center px-5 py-3.5">
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
                  <div key={post.id} className="px-4 py-3.5">
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

/** 비로그인 게스트용 블로그 분석 대시보드 — 레이아웃은 실데이터 화면과 동일하게 유지하고
 * KPI 카드·그래프·포스팅 목록은 Empty State, 프로필 영역은 로그인 유도로 대체.
 * 게스트 상태에서는 어떤 사용자 데이터 API도 호출하지 않는다. */
function GuestBlogAnalysis() {
  const loginHref = '/auth/login?redirect=/my/blogger';
  const features = ['방문자 분석', '키워드 순위', 'AI 브리핑', '포스팅 분석', '인플루언서 분석'];
  const statCards = [
    { label: 'TODAY 방문자' },
    { label: '30일 방문자수' },
    { label: '이웃수' },
    { label: '이번주 발행' },
    { label: '한달 발행' },
    { label: '통합검색 평균순위' },
    { label: '블로그탭 평균순위' },
    { label: '누락율' },
    { label: '전체 순위' },
    { label: '카테고리 순위' },
  ];

  return (
    <div className="space-y-6">

      {/* ─── CTA 배너: 로그인 후 제공되는 기능 안내 ─── */}
      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5 lg:p-6 text-center space-y-3">
        <h2 className="font-title text-lg lg:text-xl font-bold text-text">
          로그인하면 블로그 데이터를 자동으로 분석해드려요
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {features.map(f => (
            <span key={f} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface border border-accent/20 text-accent">
              {f}
            </span>
          ))}
        </div>
        <div>
          <Link href={loginHref} className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors">
            네이버 로그인
          </Link>
        </div>
      </div>

      {/* ─── 1. 프로필 헤더 (게스트) ─── */}
      <div className="bg-gradient-to-r from-surface via-surface to-accent/[0.05] rounded-2xl border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-border/30 text-dim ring-2 ring-offset-2 ring-offset-surface ring-border/40 shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold truncate text-text">네이버 블로그를 연결하세요</h1>
            <p className="text-sm text-dim mt-1">로그인 후 블로그를 연결하면 방문자·순위·포스팅 데이터를 이곳에서 확인할 수 있습니다.</p>
          </div>
          <Link href={loginHref} className="ml-auto shrink-0 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors">
            네이버 로그인
          </Link>
        </div>
      </div>

      {/* ─── 2. 대시보드 카드 (5열 x 2행, Empty State) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map((c, i) => (
          <AnimatedStatCard
            key={c.label}
            label={c.label}
            value={0}
            placeholder="-"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>}
            color="dim"
            delay={i * 40}
          />
        ))}
      </div>

      {/* ─── 3. 블로그 방문자수 그래프 (Empty State) ─── */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-border/30 flex items-center justify-center text-dim">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h3 className="font-bold text-[15px]">블로그 방문자수</h3>
        </div>
        <div className="flex items-center justify-center py-12 text-center">
          <p className="text-sm text-dim">데이터가 없습니다. 로그인 후 자동으로 분석됩니다.</p>
        </div>
      </GlassCard>

      {/* ─── 4. 포스팅 목록 (Empty State) ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30">
          <h3 className="font-bold text-[15px]">내 블로그 포스팅</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <p className="text-sm text-dim">연결된 블로그가 없습니다.</p>
          <Link href={loginHref} className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors">
            네이버 로그인
          </Link>
        </div>
      </GlassCard>

    </div>
  );
}
