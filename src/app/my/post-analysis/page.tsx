'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import { useAuth } from '@/hooks/useAuth';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';

interface BloggerProfile {
  blogId: string;
  displayName: string;
  isInfluencer: boolean;
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  date: string;
  isPublic: boolean;
}

interface PostAnalysis {
  postId: string;
  title: string;
  charCount: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;
  paragraphCount: number;
  linkCount: number;
  headingCount: number;
  mapCount: number;
  personalPronounCount: number;
  uniqueWordRatio: number;
  listItemCount: number;
  quotationCount: number;
  tableCount: number;
  textPreview: string;
  originalImageCount: number;
  avgImageSizeKB: number;
  success: boolean;
}

interface AiResult {
  aiProbability: number;
  aiReasoning: string;
  keywords: { keyword: string; relevance: 'high' | 'medium' | 'low'; searchable: boolean }[];
  keySentences: { sentence: string; type: 'topic' | 'evidence' | 'conclusion' | 'appeal'; importance: number }[];
  writingStyle: { tone: string; readability: string; originality: number };
  textLength: number;
}

interface PlagiarismResult {
  totalChecked: number;
  duplicateCount: number;
  plagiarismRate: number;
  originalRate: number;
  sentences: {
    sentence: string;
    matches: { title: string; link: string; bloggerName: string; description: string }[];
    isDuplicate: boolean;
  }[];
}

interface TextAnalysisResult {
  morphemes: {
    totalWords: number;
    uniqueWords: number;
    topWords: { word: string; count: number }[];
    distribution: { nouns: number; verbs: number; adjectives: number; adverbs: number; conjunctions: number };
  };
  sentences: {
    count: number;
    avgLength: number;
    minLength: number;
    maxLength: number;
    lengthDistribution: { label: string; count: number; percent: number }[];
    readabilityScore: number;
    readabilityLabel: string;
    sentences: { text: string; length: number; type: 'longest' | 'shortest' }[];
  };
  characters: {
    total: number;
    korean: { count: number; percent: number };
    english: { count: number; percent: number };
    number: { count: number; percent: number };
    special: { count: number; percent: number };
    readingTimeMin: number;
  };
}

function getAiBadge(score: number) {
  if (score <= 30) return { bg: 'bg-text/10', text: 'text-text', border: 'border-text/20', label: '사람' };
  if (score <= 60) return { bg: 'bg-accent/15', text: 'text-accent', border: 'border-accent/30', label: '불확실' };
  return { bg: 'bg-down/15', text: 'text-down', border: 'border-down/30', label: 'AI 의심' };
}

const sentenceTypeLabel: Record<string, string> = {
  topic: '주제', evidence: '근거', conclusion: '결론', appeal: '어필',
};

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
      return { blogId: data.blogId || data.id, displayName: data.name || data.id, isInfluencer: true };
    }
    return null;
  } catch { return null; }
}

export default function PostAnalysisPage() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsLoading, setPostsLoading] = useState(false);
  const [analyses, setAnalyses] = useState<Map<string, PostAnalysis>>(new Map());
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [aiResults, setAiResults] = useState<Map<string, AiResult>>(new Map());
  const [plagResults, setPlagResults] = useState<Map<string, PlagiarismResult>>(new Map());
  const [analyzingPost, setAnalyzingPost] = useState<string | null>(null);
  const [checkingPlag, setCheckingPlag] = useState<string | null>(null);
  const [plagProgress, setPlagProgress] = useState<{ current: number; total: number } | null>(null);
  const [textResults, setTextResults] = useState<Map<string, TextAnalysisResult>>(new Map());
  const [analyzingText, setAnalyzingText] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  const { user } = useAuth();
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';

  const handleDownload = () => {
    if (!canDownload) return;
    if (posts.length === 0) {
      alert('다운로드할 포스팅이 없습니다.');
      return;
    }
    const headers = ['제목', 'URL', '작성일', '댓글수', '글자수', '단어수', '단락수', '이미지수', '원본이미지수', '동영상수', '링크수', '헤딩수', '지도수', '리스트수', '인용구수', '표수', '평균이미지(KB)'];
    const rows: unknown[][] = [];
    for (const post of posts) {
      if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
      const a = analyses.get(post.id);
      rows.push([
        post.title,
        post.url,
        post.date,
        post.commentCount,
        a?.charCount ?? '',
        a?.wordCount ?? '',
        a?.paragraphCount ?? '',
        a?.imageCount ?? '',
        a?.originalImageCount ?? '',
        a?.videoCount ?? '',
        a?.linkCount ?? '',
        a?.headingCount ?? '',
        a?.mapCount ?? '',
        a?.listItemCount ?? '',
        a?.quotationCount ?? '',
        a?.tableCount ?? '',
        a?.avgImageSizeKB ?? '',
      ]);
    }
    const csv = rowsToCsv(headers, rows);
    downloadCsvInBrowser(`post_analysis_${todayStamp()}.csv`, csv);
  };
  const [page, setPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  // 프로필 로드
  useEffect(() => {
    getProfileFromApi().then(p => {
      if (!p) { window.location.href = '/auth/login'; return; }
      setProfile(p);
      setLoading(false);
    });
  }, []);

  // 전체 포스트 로드
  const fetchAllPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
    try {
      const allPosts: BlogPost[] = [];
      let p = 1;
      const perPage = 30;

      const firstRes = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=1&count=${perPage}`);
      if (!firstRes.ok) return;
      const firstData = await firstRes.json();
      allPosts.push(...(firstData.posts || []));
      const total = firstData.totalCount || 0;
      setPostsTotal(total);

      const totalPages = Math.ceil(total / perPage);
      for (p = 2; p <= totalPages; p++) {
        const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${p}&count=${perPage}`);
        if (!res.ok) break;
        const data = await res.json();
        if (!data.posts?.length) break;
        allPosts.push(...data.posts);
      }

      setPosts(allPosts);
    } catch { /* ignore */ }
    finally { setPostsLoading(false); }
  }, []);

  // 기본 분석 로드 (최근 15개)
  const fetchBasicAnalysis = useCallback(async (blogId: string) => {
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/blog/analyze?blogId=${encodeURIComponent(blogId)}&count=15`);
      if (res.ok) {
        const data = await res.json();
        const map = new Map<string, PostAnalysis>();
        for (const post of (data.posts || [])) {
          if (post.success) map.set(post.postId, post);
        }
        setAnalyses(map);
      }
    } catch { /* ignore */ }
    finally { setAnalysisLoading(false); }
  }, []);

  // 프로필 로드 후 데이터 fetch
  useEffect(() => {
    if (!profile) return;
    fetchAllPosts(profile.blogId);
    fetchBasicAnalysis(profile.blogId);
  }, [profile, fetchAllPosts, fetchBasicAnalysis]);

  // AI 심층 분석 (SSE)
  const runAiAnalysis = useCallback(async (logNo: string) => {
    if (!profile || analyzingPost) return;
    setAnalyzingPost(logNo);
    setExpandedPost(logNo);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/blog/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, logNo }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error('요청 실패');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'result') {
              setAiResults(prev => {
                const next = new Map(prev);
                next.set(logNo, event.data);
                return next;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('AI 분석 오류:', err);
      }
    } finally {
      setAnalyzingPost(null);
      abortRef.current = null;
    }
  }, [profile, analyzingPost]);

  // 표절검사 (SSE)
  const runPlagiarismCheck = useCallback(async (logNo: string) => {
    if (!profile || checkingPlag) return;
    setCheckingPlag(logNo);
    setExpandedPost(logNo);
    setPlagProgress(null);

    try {
      const res = await fetch('/api/blog/plagiarism-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, logNo }),
      });

      if (!res.ok || !res.body) throw new Error('요청 실패');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setPlagProgress(event.data);
            } else if (event.type === 'result') {
              setPlagResults(prev => {
                const next = new Map(prev);
                next.set(logNo, event.data);
                return next;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('표절검사 오류:', err);
    } finally {
      setCheckingPlag(null);
      setPlagProgress(null);
    }
  }, [profile, checkingPlag]);

  // 형태소/문장 분석
  const runTextAnalysis = useCallback(async (logNo: string) => {
    if (!profile || analyzingText) return;
    setAnalyzingText(logNo);
    setExpandedPost(logNo);

    try {
      const res = await fetch('/api/blog/text-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, logNo }),
      });

      if (!res.ok) throw new Error('요청 실패');
      const data = await res.json();
      setTextResults(prev => {
        const next = new Map(prev);
        next.set(logNo, data);
        return next;
      });
    } catch (err) {
      console.error('텍스트 분석 오류:', err);
    } finally {
      setAnalyzingText(null);
    }
  }, [profile, analyzingText]);

  // 페이지네이션
  const perPage = 20;
  const totalPages = Math.ceil(posts.length / perPage);
  const visiblePosts = posts.slice((page - 1) * perPage, page * perPage);

  // 통계 계산
  const analysisArray = Array.from(analyses.values());
  const aiResultArray = Array.from(aiResults.values());
  const avgAiScore = aiResultArray.length > 0
    ? Math.round(aiResultArray.reduce((s, a) => s + a.aiProbability, 0) / aiResultArray.length)
    : 0;
  const avgCharCount = analysisArray.length > 0
    ? Math.round(analysisArray.reduce((s, a) => s + a.charCount, 0) / analysisArray.length)
    : 0;
  const originalRatio = analysisArray.length > 0
    ? Math.round(analysisArray.filter(a => a.originalImageCount >= 1).length / analysisArray.length * 100)
    : 0;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-title font-bold">포스팅 분석</h1>
          <p className="text-sm text-dim mt-1">AI 작성 여부 판별, 키워드 추출, 핵심 문장 분석</p>
        </div>
        {canDownload && (
          <button
            onClick={handleDownload}
            disabled={posts.length === 0}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
            title="포스팅 + 분석 결과 CSV 다운로드 (최대 500건)"
          >
            CSV 다운로드
          </button>
        )}
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AnimatedStatCard
          label="전체 포스팅"
          value={postsLoading ? 0 : postsTotal}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>}
        />
        <AnimatedStatCard
          label="평균 AI 확률"
          value={analysisLoading ? 0 : avgAiScore}
          suffix="%"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M20 12a8 8 0 0 0-8-8v8h8z"/></svg>}
        />
        <AnimatedStatCard
          label="평균 글자수"
          value={analysisLoading ? 0 : avgCharCount}
          suffix="자"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>}
        />
        <AnimatedStatCard
          label="원본 사진 비율"
          value={analysisLoading ? 0 : originalRatio}
          suffix="%"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
        />
      </div>

      {/* 포스트 목록 */}
      <GlassCard>
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[15px]">포스팅 목록</h3>
            <p className="text-[11px] text-dim mt-0.5">
              {postsLoading ? '로딩 중...' : `전체 ${posts.length}개 포스팅`}
              {analysisLoading && ' / 기본 분석 로딩 중...'}
            </p>
          </div>
        </div>

        {postsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="ml-3 text-sm text-dim">전체 포스팅 로딩 중...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-dim text-sm">
            <p>포스팅을 찾을 수 없습니다.</p>
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-dim">
                    <th className="text-left px-5 py-3 font-semibold">제목</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">글자수</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">이미지</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">날짜</th>
                    <th className="text-right px-5 py-3 font-semibold w-56">분석</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {visiblePosts.map(post => {
                    const analysis = analyses.get(post.id);
                    const aiResult = aiResults.get(post.id);
                    const plagResult = plagResults.get(post.id);
                    const textResult = textResults.get(post.id);
                    const aiBadge = aiResult ? getAiBadge(aiResult.aiProbability) : null;
                    const isExpanded = expandedPost === post.id;
                    const isAnalyzing = analyzingPost === post.id;
                    const isCheckingPlag = checkingPlag === post.id;
                    const isAnalyzingText = analyzingText === post.id;

                    return (<>
                      <tr key={post.id} className="group hover:bg-surface-hover/50 transition-colors cursor-pointer" onClick={() => setExpandedPost(isExpanded ? null : post.id)}>
                        <td className="px-5 py-3.5">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold text-sm hover:text-accent transition-colors line-clamp-1 block"
                            onClick={e => e.stopPropagation()}>
                            {post.title}
                          </a>
                          {aiBadge && (
                            <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${aiBadge.bg} ${aiBadge.text}`}>
                              AI {aiResult!.aiProbability}%
                            </span>
                          )}
                          {plagResult && (
                            <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ml-1 ${plagResult.originalRate >= 80 ? 'bg-text/10 text-text' : plagResult.originalRate >= 50 ? 'bg-accent/10 text-accent' : 'bg-down/10 text-down'}`}>
                              원본 {plagResult.originalRate}%
                            </span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {analysis ? (
                            <span className="text-xs">{analysis.charCount.toLocaleString()}</span>
                          ) : <span className="text-[10px] text-dim">-</span>}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {analysis ? (
                            <span className="text-xs">{analysis.imageCount}</span>
                          ) : <span className="text-[10px] text-dim">-</span>}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          <span className="text-[11px] text-dim">{post.date}</span>
                        </td>
                        <td className="text-right px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {isAnalyzing ? (
                              <span className="w-4 h-4 border-2 border-down/30 border-t-down rounded-full animate-spin inline-block" />
                            ) : !aiResult ? (
                              <button onClick={e => { e.stopPropagation(); runAiAnalysis(post.id); }}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-down/10 text-down font-bold hover:bg-down/20 transition cursor-pointer whitespace-nowrap">
                                AI 분석
                              </button>
                            ) : null}
                            {isCheckingPlag ? (
                              <span className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin inline-block" />
                            ) : !plagResult ? (
                              <button onClick={e => { e.stopPropagation(); runPlagiarismCheck(post.id); }}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold hover:bg-emerald-500/20 transition cursor-pointer whitespace-nowrap">
                                표절검사
                              </button>
                            ) : null}
                            {isAnalyzingText ? (
                              <span className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin inline-block" />
                            ) : !textResult ? (
                              <button onClick={e => { e.stopPropagation(); runTextAnalysis(post.id); }}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 font-bold hover:bg-blue-500/20 transition cursor-pointer whitespace-nowrap">
                                형태소분석
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <div className="px-5 pb-5 pt-3 space-y-4 bg-bg/20 border-t border-border/30" onClick={e => e.stopPropagation()}>
                              {/* 본문 미리보기 */}
                              {analysis?.textPreview && (
                                <div>
                                  <h4 className="text-xs font-bold text-dim mb-1">본문 미리보기</h4>
                                  <p className="text-xs text-dim leading-relaxed bg-bg rounded-xl p-3 line-clamp-3">
                                    {analysis.textPreview}
                                  </p>
                                </div>
                              )}

                              {/* AI 심층 분석 버튼 */}
                              {!aiResult && !isAnalyzing && (
                                <button
                                  onClick={e => { e.stopPropagation(); e.preventDefault(); runAiAnalysis(post.id); }}
                                  className="text-sm px-4 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent-hover transition cursor-pointer"
                                >
                                  AI 심층 분석 실행
                                </button>
                              )}

                              {/* AI 분석 진행 중 */}
                              {isAnalyzing && (
                                <div className="flex items-center gap-2 text-sm text-dim py-2">
                                  <span className="animate-spin inline-block w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full" />
                                  AI 분석 중...
                                </div>
                              )}

                              {/* AI 분석 결과 */}
                              {aiResult && (
                                <div className="space-y-4 pt-2 border-t border-border/30">
                                  <h4 className="text-xs font-bold text-accent">AI 심층 분석 결과 (Claude)</h4>

                                  {/* AI 확률 */}
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold">AI 확률:</span>
                                    <span className={`text-lg font-black font-rank ${
                                      aiResult.aiProbability <= 30 ? 'text-text' : aiResult.aiProbability <= 60 ? 'text-accent' : 'text-down'
                                    }`}>
                                      {aiResult.aiProbability}%
                                    </span>
                                    <div className="flex-1 h-2 bg-border/30 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          aiResult.aiProbability <= 30 ? 'bg-text' : aiResult.aiProbability <= 60 ? 'bg-accent' : 'bg-down'
                                        }`}
                                        style={{ width: `${aiResult.aiProbability}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* 판단 근거 */}
                                  <div className="bg-bg rounded-xl p-3">
                                    <p className="text-xs text-dim font-semibold mb-1">판단 근거</p>
                                    <p className="text-sm leading-relaxed">{aiResult.aiReasoning}</p>
                                  </div>

                                  {/* 키워드 */}
                                  {aiResult.keywords.length > 0 && (
                                    <div>
                                      <p className="text-xs text-dim font-semibold mb-2">핵심 키워드</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {aiResult.keywords.map((kw, i) => (
                                          <span key={i} className={`text-xs px-2.5 py-1 rounded-lg border ${
                                            kw.relevance === 'high' ? 'bg-accent/10 text-accent border-accent/20 font-bold'
                                            : kw.relevance === 'medium' ? 'bg-border/30 text-text border-border/40'
                                            : 'bg-border/20 text-dim border-border/30'
                                          }`}>
                                            {kw.keyword}
                                            {kw.searchable && (
                                              <a
                                                href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw.keyword)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ml-1 opacity-50 hover:opacity-100"
                                                onClick={e => e.stopPropagation()}
                                              >
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                                              </a>
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 핵심 문장 */}
                                  {aiResult.keySentences.length > 0 && (
                                    <div>
                                      <p className="text-xs text-dim font-semibold mb-2">핵심 문장</p>
                                      <div className="space-y-2">
                                        {aiResult.keySentences.map((s, i) => (
                                          <div key={i} className="flex items-start gap-2 text-sm">
                                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                              s.type === 'topic' ? 'bg-accent/10 text-accent'
                                              : s.type === 'evidence' ? 'bg-text/10 text-text'
                                              : s.type === 'conclusion' ? 'bg-down/10 text-down'
                                              : 'bg-text/15 text-text'
                                            }`}>
                                              {sentenceTypeLabel[s.type] || s.type}
                                            </span>
                                            <span className="leading-relaxed">{s.sentence}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 글쓰기 스타일 */}
                                  {aiResult.writingStyle && (
                                    <div className="flex flex-wrap gap-2 text-xs">
                                      <span className="px-2.5 py-1 rounded-lg bg-border/20 text-dim">
                                        스타일: <strong className="text-text">{aiResult.writingStyle.tone}</strong>
                                      </span>
                                      <span className="px-2.5 py-1 rounded-lg bg-border/20 text-dim">
                                        가독성: <strong className="text-text">{aiResult.writingStyle.readability === 'easy' ? '쉬움' : aiResult.writingStyle.readability === 'medium' ? '보통' : '어려움'}</strong>
                                      </span>
                                      <span className="px-2.5 py-1 rounded-lg bg-border/20 text-dim">
                                        독창성: <strong className="text-text">{aiResult.writingStyle.originality}/10</strong>
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* 표절검사 버튼 */}
                              {!plagResult && !isCheckingPlag && (
                                <button
                                  onClick={e => { e.stopPropagation(); e.preventDefault(); runPlagiarismCheck(post.id); }}
                                  className="text-sm px-4 py-2 rounded-xl bg-text text-white font-bold hover:bg-text/90 transition cursor-pointer"
                                >
                                  표절검사 실행
                                </button>
                              )}

                              {/* 표절검사 진행 중 */}
                              {isCheckingPlag && (
                                <div className="flex items-center gap-2 text-sm text-dim py-2">
                                  <span className="animate-spin inline-block w-4 h-4 border-2 border-text/30 border-t-text rounded-full" />
                                  표절검사 중...
                                  {plagProgress && (
                                    <span className="text-xs">({plagProgress.current}/{plagProgress.total})</span>
                                  )}
                                </div>
                              )}

                              {/* 표절검사 결과 */}
                              {plagResult && (
                                <div className="space-y-4 pt-2 border-t border-border/30">
                                  <h4 className="text-xs font-bold text-text">표절검사 결과</h4>

                                  {/* 원본율 */}
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold">원본율:</span>
                                    <span className={`text-lg font-black font-rank ${
                                      plagResult.originalRate >= 80 ? 'text-text' : plagResult.originalRate >= 50 ? 'text-accent' : 'text-down'
                                    }`}>
                                      {plagResult.originalRate}%
                                    </span>
                                    <div className="flex-1 h-2 bg-border/30 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          plagResult.originalRate >= 80 ? 'bg-text' : plagResult.originalRate >= 50 ? 'bg-accent' : 'bg-down'
                                        }`}
                                        style={{ width: `${plagResult.originalRate}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="flex gap-3 text-xs text-dim">
                                    <span>검사 문장: <strong className="text-text">{plagResult.totalChecked}개</strong></span>
                                    <span>유사 발견: <strong className={plagResult.duplicateCount > 0 ? 'text-down' : 'text-text'}>{plagResult.duplicateCount}개</strong></span>
                                  </div>

                                  {/* 문장별 결과 */}
                                  <div className="space-y-2">
                                    {plagResult.sentences.map((s, i) => (
                                      <div key={i} className={`text-sm rounded-xl p-3 border ${
                                        s.isDuplicate ? 'bg-down/5 border-down/20' : 'bg-text/5 border-text/15'
                                      }`}>
                                        <div className="flex items-start gap-2">
                                          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            s.isDuplicate ? 'bg-down/10 text-down' : 'bg-text/10 text-text'
                                          }`}>
                                            {s.isDuplicate ? '유사' : '원본'}
                                          </span>
                                          <p className="leading-relaxed text-xs line-clamp-2">{s.sentence}</p>
                                        </div>
                                        {s.matches.length > 0 && (
                                          <div className="mt-2 pl-6 space-y-1">
                                            {s.matches.map((m, j) => (
                                              <a key={j} href={m.link} target="_blank" rel="noopener noreferrer"
                                                className="block text-[11px] text-dim hover:text-accent transition">
                                                <span className="font-semibold text-text">{m.bloggerName}</span>: {m.title}
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 형태소/문장 분석 버튼 */}
                              {!textResult && !isAnalyzingText && (
                                <button
                                  onClick={e => { e.stopPropagation(); e.preventDefault(); runTextAnalysis(post.id); }}
                                  className="text-sm px-4 py-2 rounded-xl bg-down text-white font-bold hover:bg-down/90 transition cursor-pointer"
                                >
                                  형태소/문장 분석
                                </button>
                              )}

                              {isAnalyzingText && (
                                <div className="flex items-center gap-2 text-sm text-dim py-2">
                                  <span className="animate-spin inline-block w-4 h-4 border-2 border-down/30 border-t-down rounded-full" />
                                  형태소/문장 분석 중...
                                </div>
                              )}

                              {/* 형태소/문장 분석 결과 */}
                              {textResult && (
                                <div className="space-y-4 pt-2 border-t border-border/30">
                                  <h4 className="text-xs font-bold text-down">형태소/문장 분석 결과</h4>

                                  {/* 문자 구성 */}
                                  <div className="grid grid-cols-5 gap-2">
                                    <div className="bg-bg rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-dim">전체</p>
                                      <p className="text-sm font-bold">{textResult.characters.total.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-bg rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-dim">한글</p>
                                      <p className="text-sm font-bold">{textResult.characters.korean.percent}%</p>
                                    </div>
                                    <div className="bg-bg rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-dim">영어</p>
                                      <p className="text-sm font-bold">{textResult.characters.english.percent}%</p>
                                    </div>
                                    <div className="bg-bg rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-dim">숫자</p>
                                      <p className="text-sm font-bold">{textResult.characters.number.percent}%</p>
                                    </div>
                                    <div className="bg-bg rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-dim">읽기 시간</p>
                                      <p className="text-sm font-bold">{textResult.characters.readingTimeMin}분</p>
                                    </div>
                                  </div>

                                  {/* 문장 분석 */}
                                  <div>
                                    <p className="text-xs text-dim font-semibold mb-2">문장 분석</p>
                                    <div className="flex items-center gap-4 mb-2 text-xs">
                                      <span>문장 수: <strong className="text-text">{textResult.sentences.count}개</strong></span>
                                      <span>평균 길이: <strong className="text-text">{textResult.sentences.avgLength}자</strong></span>
                                      <span>가독성: <strong className={textResult.sentences.readabilityScore >= 70 ? 'text-text' : textResult.sentences.readabilityScore >= 40 ? 'text-accent' : 'text-down'}>{textResult.sentences.readabilityLabel} ({textResult.sentences.readabilityScore}점)</strong></span>
                                    </div>
                                    {/* 길이 분포 바 */}
                                    <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
                                      {textResult.sentences.lengthDistribution.map((d, i) => (
                                        d.count > 0 && (
                                          <div
                                            key={i}
                                            className={`flex items-center justify-center text-[9px] font-bold text-white ${
                                              i === 0 ? 'bg-text' : i === 1 ? 'bg-text/70' : i === 2 ? 'bg-accent' : i === 3 ? 'bg-down/70' : 'bg-down'
                                            }`}
                                            style={{ flex: d.count }}
                                            title={`${d.label}: ${d.count}개 (${d.percent}%)`}
                                          >
                                            {d.percent >= 10 && `${d.label}`}
                                          </div>
                                        )
                                      ))}
                                    </div>
                                    <div className="flex gap-2 mt-1 text-[10px] text-dim">
                                      {textResult.sentences.lengthDistribution.map((d, i) => (
                                        <span key={i}>{d.label}: {d.count}개</span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 형태소 분포 */}
                                  <div>
                                    <p className="text-xs text-dim font-semibold mb-2">형태소 분포 (총 {textResult.morphemes.totalWords.toLocaleString()}단어, 고유 {textResult.morphemes.uniqueWords.toLocaleString()}개)</p>
                                    <div className="flex gap-2 flex-wrap">
                                      {[
                                        { label: '명사', count: textResult.morphemes.distribution.nouns, color: 'bg-accent/10 text-accent border-accent/20' },
                                        { label: '동사', count: textResult.morphemes.distribution.verbs, color: 'bg-text/10 text-text border-text/20' },
                                        { label: '형용사', count: textResult.morphemes.distribution.adjectives, color: 'bg-down/10 text-down border-down/20' },
                                        { label: '부사', count: textResult.morphemes.distribution.adverbs, color: 'bg-accent/15 text-accent border-accent/30' },
                                        { label: '접속사', count: textResult.morphemes.distribution.conjunctions, color: 'bg-text/15 text-text border-text/30' },
                                      ].map(item => (
                                        <span key={item.label} className={`text-xs px-2.5 py-1 rounded-lg border ${item.color}`}>
                                          {item.label}: <strong>{item.count}</strong>
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 단어 빈도 */}
                                  <div>
                                    <p className="text-xs text-dim font-semibold mb-2">자주 사용한 단어 (상위 20)</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {textResult.morphemes.topWords.slice(0, 20).map((w, i) => (
                                        <span key={i} className={`text-xs px-2 py-0.5 rounded-lg border ${
                                          i < 3 ? 'bg-accent/10 text-accent border-accent/20 font-bold'
                                          : i < 10 ? 'bg-border/30 text-text border-border/40'
                                          : 'bg-border/20 text-dim border-border/30'
                                        }`}>
                                          {w.word} <span className="text-[10px] opacity-60">x{w.count}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 주요 문장 */}
                                  {textResult.sentences.sentences.length > 0 && (
                                    <div>
                                      <p className="text-xs text-dim font-semibold mb-2">주요 문장</p>
                                      <div className="space-y-1.5">
                                        {textResult.sentences.sentences.map((s, i) => (
                                          <div key={i} className="flex items-start gap-2 text-xs">
                                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                              s.type === 'longest' ? 'bg-down/10 text-down' : 'bg-text/10 text-text'
                                            }`}>
                                              {s.type === 'longest' ? '긴 문장' : '짧은 문장'} {s.length}자
                                            </span>
                                            <span className="leading-relaxed text-dim">{s.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {visiblePosts.map(post => {
                const analysis = analyses.get(post.id);
                const aiResult = aiResults.get(post.id);
                const plagResult = plagResults.get(post.id);
                const textResult = textResults.get(post.id);
                const aiBadge = aiResult ? getAiBadge(aiResult.aiProbability) : null;
                const isExpanded = expandedPost === post.id;
                const isAnalyzing = analyzingPost === post.id;
                const isCheckingPlag = checkingPlag === post.id;
                const isAnalyzingText = analyzingText === post.id;

                return (
                  <div key={post.id} className="px-4 py-4">
                    <div
                      className="cursor-pointer"
                      onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition-colors line-clamp-2 flex-1"
                          onClick={e => e.stopPropagation()}
                        >
                          {post.title}
                        </a>
                        {aiBadge && (
                          <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${aiBadge.bg} ${aiBadge.text} ${aiBadge.border}`}>
                            {aiResult!.aiProbability}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-dim">
                        {analysis && <span>{analysis.charCount.toLocaleString()}자</span>}
                        {analysis && <span>이미지 {analysis.imageCount}장</span>}
                        {post.date && <span>{new Date(post.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>}
                        {isAnalyzing ? (
                          <span className="animate-spin inline-block w-3 h-3 border border-accent border-t-transparent rounded-full" />
                        ) : aiResult ? (
                          <span className="text-accent font-bold">AI 완료</span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); runAiAnalysis(post.id); }}
                            className="text-accent font-bold cursor-pointer"
                          >
                            AI 분석
                          </button>
                        )}
                        {isCheckingPlag ? (
                          <span className="animate-spin inline-block w-3 h-3 border border-text border-t-transparent rounded-full" />
                        ) : plagResult ? (
                          <span className={`font-bold ${plagResult.originalRate >= 80 ? 'text-text' : 'text-down'}`}>
                            원본 {plagResult.originalRate}%
                          </span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); runPlagiarismCheck(post.id); }}
                            className="text-text font-bold cursor-pointer"
                          >
                            표절검사
                          </button>
                        )}
                        {isAnalyzingText ? (
                          <span className="animate-spin inline-block w-3 h-3 border border-down border-t-transparent rounded-full" />
                        ) : textResult ? (
                          <span className="text-down font-bold">형태소</span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); runTextAnalysis(post.id); }}
                            className="text-down font-bold cursor-pointer"
                          >
                            형태소분석
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 모바일 확장 */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                        {!aiResult && !isAnalyzing && (
                          <button
                            onClick={() => runAiAnalysis(post.id)}
                            className="text-sm px-4 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent-hover transition cursor-pointer w-full"
                          >
                            AI 심층 분석 실행
                          </button>
                        )}

                        {aiResult && (
                          <div className="space-y-3 pt-2 border-t border-border/30">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">AI 확률:</span>
                              <span className={`font-black font-rank ${
                                aiResult.aiProbability <= 30 ? 'text-text' : aiResult.aiProbability <= 60 ? 'text-accent' : 'text-down'
                              }`}>
                                {aiResult.aiProbability}%
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed bg-bg rounded-xl p-2.5">{aiResult.aiReasoning}</p>
                            {aiResult.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {aiResult.keywords.map((kw, i) => (
                                  <span key={i} className={`text-[10px] px-2 py-0.5 rounded-lg ${
                                    kw.relevance === 'high' ? 'bg-accent/10 text-accent font-bold' : 'bg-border/30 text-dim'
                                  }`}>
                                    {kw.keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                            {aiResult.keySentences.length > 0 && (
                              <div className="space-y-1.5">
                                {aiResult.keySentences.map((s, i) => (
                                  <div key={i} className="flex items-start gap-1.5 text-xs">
                                    <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${
                                      s.type === 'topic' ? 'bg-accent/10 text-accent' : s.type === 'evidence' ? 'bg-text/10 text-text' : s.type === 'conclusion' ? 'bg-down/10 text-down' : 'bg-text/15 text-text'
                                    }`}>{sentenceTypeLabel[s.type]}</span>
                                    <span className="leading-relaxed">{s.sentence}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 모바일 표절검사 */}
                        {!plagResult && !isCheckingPlag && (
                          <button
                            onClick={() => runPlagiarismCheck(post.id)}
                            className="text-sm px-4 py-2 rounded-xl bg-text text-white font-bold hover:bg-text/90 transition cursor-pointer w-full"
                          >
                            표절검사 실행
                          </button>
                        )}
                        {isCheckingPlag && (
                          <div className="flex items-center gap-2 text-sm text-dim">
                            <span className="animate-spin inline-block w-3 h-3 border border-text border-t-transparent rounded-full" />
                            표절검사 중... {plagProgress && `(${plagProgress.current}/${plagProgress.total})`}
                          </div>
                        )}
                        {plagResult && (
                          <div className="space-y-3 pt-2 border-t border-border/30">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">원본율:</span>
                              <span className={`font-black font-rank ${plagResult.originalRate >= 80 ? 'text-text' : plagResult.originalRate >= 50 ? 'text-accent' : 'text-down'}`}>
                                {plagResult.originalRate}%
                              </span>
                              <span className="text-[10px] text-dim">({plagResult.duplicateCount}/{plagResult.totalChecked} 유사)</span>
                            </div>
                            <div className="space-y-1.5">
                              {plagResult.sentences.map((s, i) => (
                                <div key={i} className={`text-xs rounded-lg p-2 border ${s.isDuplicate ? 'bg-down/5 border-down/20' : 'bg-text/5 border-text/15'}`}>
                                  <div className="flex items-start gap-1.5">
                                    <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${s.isDuplicate ? 'bg-down/10 text-down' : 'bg-text/10 text-text'}`}>
                                      {s.isDuplicate ? '유사' : '원본'}
                                    </span>
                                    <span className="line-clamp-1">{s.sentence}</span>
                                  </div>
                                  {s.matches.length > 0 && (
                                    <div className="mt-1 pl-5">
                                      {s.matches.slice(0, 2).map((m, j) => (
                                        <a key={j} href={m.link} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-dim hover:text-accent truncate">
                                          {m.bloggerName}: {m.title}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 모바일 형태소/문장 분석 */}
                        {!textResult && !isAnalyzingText && (
                          <button
                            onClick={() => runTextAnalysis(post.id)}
                            className="text-sm px-4 py-2 rounded-xl bg-down text-white font-bold hover:bg-down/90 transition cursor-pointer w-full"
                          >
                            형태소/문장 분석
                          </button>
                        )}
                        {isAnalyzingText && (
                          <div className="flex items-center gap-2 text-sm text-dim">
                            <span className="animate-spin inline-block w-3 h-3 border border-down border-t-transparent rounded-full" />
                            형태소/문장 분석 중...
                          </div>
                        )}
                        {textResult && (
                          <div className="space-y-3 pt-2 border-t border-border/30">
                            <h4 className="text-xs font-bold text-down">형태소/문장 분석</h4>
                            <div className="grid grid-cols-3 gap-1.5 text-center">
                              <div className="bg-bg rounded-lg p-1.5">
                                <p className="text-[9px] text-dim">문장수</p>
                                <p className="text-xs font-bold">{textResult.sentences.count}</p>
                              </div>
                              <div className="bg-bg rounded-lg p-1.5">
                                <p className="text-[9px] text-dim">평균길이</p>
                                <p className="text-xs font-bold">{textResult.sentences.avgLength}자</p>
                              </div>
                              <div className="bg-bg rounded-lg p-1.5">
                                <p className="text-[9px] text-dim">가독성</p>
                                <p className={`text-xs font-bold ${textResult.sentences.readabilityScore >= 70 ? 'text-text' : textResult.sentences.readabilityScore >= 40 ? 'text-accent' : 'text-down'}`}>{textResult.sentences.readabilityScore}점</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {textResult.morphemes.topWords.slice(0, 12).map((w, i) => (
                                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${i < 3 ? 'bg-accent/10 text-accent font-bold' : 'bg-border/30 text-dim'}`}>
                                  {w.word} x{w.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-border/30">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-xs px-3 py-1.5 rounded-lg bg-border/20 text-dim hover:bg-border/30 transition disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  이전
                </button>
                <span className="text-xs text-dim font-rank">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="text-xs px-3 py-1.5 rounded-lg bg-border/20 text-dim hover:bg-border/30 transition disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
}
