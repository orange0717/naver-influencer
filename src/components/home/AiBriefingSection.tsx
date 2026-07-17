'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
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
  viewCount?: number;
}

interface SubScores {
  sourceUsage: number;
  faq: number;
  table: number;
  image: number;
  freshness: number;
  length: number;
  headings: number;
  keywordDensity: number;
  entity: number;
  internalLink: number;
  externalLink: number;
  eeat: number;
  schema: null;
}

interface PostScore {
  postId: string;
  title: string | null;
  viewCount: number | null;
  publishedAt: string | null;
  representativeKeyword: string | null;
  aiScore: number;
  seoScore: number;
  geoScore: number;
  aeoScore: number;
  subScores: SubScores;
  causeTags: string[];
  computedAt: string;
}

const SCORE_API = '/api/blog/analyze-post-score';

const SUB_SCORE_LABELS: Record<keyof Omit<SubScores, 'schema'>, string> = {
  sourceUsage: '출처 활용',
  faq: 'FAQ',
  table: '표',
  image: '이미지',
  freshness: '최신성',
  length: '본문 길이',
  headings: '소제목',
  keywordDensity: '키워드 밀도',
  entity: '엔티티',
  internalLink: '내부링크',
  externalLink: '외부링크',
  eeat: 'E-E-A-T',
};

const IMPROVEMENT_SUGGESTIONS: Partial<Record<keyof Omit<SubScores, 'schema'>, string>> = {
  sourceUsage: '뉴스·정부·공공기관 등 공식 출처 링크를 1~2개 추가하세요.',
  faq: '"자주 묻는 질문" 형태의 FAQ 섹션을 추가하세요.',
  table: '핵심 정보를 정리한 표를 1개 이상 추가하세요.',
  image: '사진(직접 촬영 원본 포함)을 3~5장 이상 추가하세요.',
  freshness: '오래된 정보라면 최신 내용으로 갱신하고 발행일을 새로 올리세요.',
  length: '본문을 800자 이상으로 보강하세요.',
  headings: '소제목(H태그)을 2~3개 이상 추가해 구조를 명확히 하세요.',
  keywordDensity: '대표 키워드를 본문에 자연스럽게 더 포함시키세요(0.5~2.5% 권장).',
  entity: '주제와 관련된 구체적인 용어·개체명을 더 다양하게 언급하세요.',
  internalLink: '내 블로그의 관련 포스팅으로 연결되는 링크를 추가하세요.',
  externalLink: '신뢰할 수 있는 외부 자료로 연결되는 링크를 추가하세요.',
  eeat: '1인칭 경험(직접 해봤어요 등)과 인용·근거 표기를 추가하세요.',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-up';
  if (score >= 40) return 'text-gold';
  return 'text-down';
}

function ScoreCell({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-[10px] text-dim/50">--</span>;
  return <span className={`text-xs font-bold ${scoreColor(score)}`}>{score}</span>;
}

/** "개선하기" 패널 — Phase 1은 규칙 기반 sub-score만으로 약점을 나열하는 기초 진단(Claude 미사용). */
function ImprovePanel({ score }: { score: PostScore }) {
  const weakItems = (Object.keys(SUB_SCORE_LABELS) as (keyof Omit<SubScores, 'schema'>)[])
    .filter(key => score.subScores[key] < 50)
    .sort((a, b) => score.subScores[a] - score.subScores[b]);

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span>AI <b className={scoreColor(score.aiScore)}>{score.aiScore}</b></span>
          <span>SEO <b className={scoreColor(score.seoScore)}>{score.seoScore}</b></span>
          <span>GEO <b className={scoreColor(score.geoScore)}>{score.geoScore}</b></span>
          <span>AEO <b className={scoreColor(score.aeoScore)}>{score.aeoScore}</b></span>
        </div>
        <span className="text-[10px] text-dim">규칙 기반 기초 진단입니다 — AI(Claude) 분석 기능은 준비 중입니다.</span>
      </div>
      {weakItems.length === 0 ? (
        <p className="text-xs text-dim">뚜렷한 약점이 발견되지 않았습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {weakItems.map(key => (
            <li key={key} className="text-xs flex items-start gap-2">
              <span className="font-semibold text-down shrink-0">{SUB_SCORE_LABELS[key]}({score.subScores[key]}점)</span>
              <span className="text-dim">{IMPROVEMENT_SUGGESTIONS[key]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface BriefingResult {
  // AI 브리핑(통합검색 인라인 위젯) — AI 탭과 완전히 별개인 독립 서비스
  hasAiBriefing: boolean | null;  // 이 키워드로 통합검색 시 AI 브리핑 위젯 콘텐츠 자체가 생성됐는지
  exposed: boolean | null;        // 그 위젯의 출처 목록에 내 게시글(blogId+postId)이 포함되는지
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
  // AI 탭 — 위 필드와 서로 무관하게 독립적으로 판정된 결과(같은 키워드라도 소스 큐레이션이 다름)
  hasAiTab: boolean | null;       // 이 키워드로 AI 탭에 들어갔을 때 콘텐츠 자체가 생성됐는지
  tabExposed: boolean | null;     // AI 탭의 출처 목록에 내 게시글이 포함되는지
  tabSourceIndex: number | null;
  tabSourceTotal: number | null;
  tabMatchedTitle: string | null;
  error?: string;
}

const STATE_API = '/api/my/ai-briefing-state';

// 서버(DB)에서 저장된 타겟 키워드/AI 브리핑 결과를 복원한다. (기기 간 동기화)
async function fetchBriefingState(blogId: string): Promise<{
  postKeywords: Record<string, string[]>;
  briefingResults: Record<string, BriefingResult>;
}> {
  const res = await fetch(`${STATE_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('상태 로드 실패');
  return res.json();
}

// 포스트별 타겟 키워드 할당을 DB에 저장 (제거된 키워드 삭제 포함)
function saveKeywordsToDb(blogId: string, postId: string, keywords: string[]): void {
  fetch(STATE_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keywords }),
  }).catch(() => { /* 낙관적 UI — 실패는 다음 동작에서 재시도됨 */ });
}

// 단일 (post, keyword) AI 브리핑 확인 결과를 DB에 갱신
function saveBriefingResultToDb(blogId: string, postId: string, keyword: string, result: BriefingResult): void {
  fetch(STATE_API, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keyword, result }),
  }).catch(() => { /* ignore */ });
}

function rankKey(postId: string, keyword: string): string {
  return `${postId}::${keyword}`;
}

/**
 * "AI 브리핑" 컬럼 배지 — 통합검색 인라인 위젯(AI 탭과 무관한 별개 서비스) 결과만 사용.
 * 2026-07-04(6차) 오렌지 지시: 상태 문구를 "인용"/"미인용" 두 가지로만 통일한다.
 * 콘텐츠 자체가 생성되지 않은 경우("없음")와 생성됐지만 내 글이 인용되지 않은 경우를
 * 더 이상 구분 표시하지 않고 둘 다 "미인용"으로 표기한다 — exposed 단일 필드로만 판정.
 */
function BriefingLabelBadge({ result }: { result?: BriefingResult }) {
  if (!result) return <span className="text-[10px] text-dim/50">--</span>;
  if (!result.exposed) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="AI 브리핑 출처 목록에 이 게시글이 없습니다.">
        미인용
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 브리핑의 출처 목록에 이 게시글이 포함되어 있습니다.">
        인용
      </span>
      {result.sourceIndex && (
        <span className="text-[10px] text-dim">
          출처 #{result.sourceIndex}{result.sourceTotal ? `/${result.sourceTotal}` : ''}
        </span>
      )}
    </span>
  );
}

/**
 * "AI 탭" 컬럼 배지 — AI 탭(전체화면 채팅형 UI, AI 브리핑과 무관한 별개 서비스) 결과만 사용.
 * ⚠️ 절대 hasAiBriefing/exposed(AI 브리핑 필드)를 참조하지 않는다 — 같은 키워드라도 두 서비스는
 * 서로 다른 소스 큐레이션을 쓰므로 "브리핑 미인용+탭 인용" 같은 조합도 정상적으로 나올 수 있다.
 * 2026-07-04(6차) 오렌지 지시: 상태 문구를 "인용"/"미인용" 두 가지로만 통일(BriefingLabelBadge와 동일 원칙).
 */
function AiTabBadge({ result }: { result?: BriefingResult }) {
  if (!result) return <span className="text-[10px] text-dim/50">--</span>;
  if (!result.tabExposed) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="AI 탭 출처 목록에 이 게시글이 없습니다.">
        미인용
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 탭의 출처 목록에 이 게시글이 포함되어 있습니다.">
        인용
      </span>
      {result.tabSourceIndex && (
        <span className="text-[10px] text-dim">
          출처 #{result.tabSourceIndex}{result.tabSourceTotal ? `/${result.tabSourceTotal}` : ''}
        </span>
      )}
    </span>
  );
}

/** 확인 진행 단계 → 사용자에게 보여줄 문구 (2026-07-04(6차) 진행 상태 UI) */
const STAGE_LABELS: Record<string, string> = {
  searching: '검색 중...',
  briefing: 'AI 브리핑 확인 중...',
  tab: 'AI 탭 확인 중...',
  comparing: '출처 비교 중...',
  done: '완료',
};

export default function AiBriefingSection() {
  const { user, isLoading: authLoading } = useAuth();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(30);
  const [postsLoading, setPostsLoading] = useState(false);

  // postId → 타겟 키워드 배열
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // postId → 타겟 키워드 배열 (편집 중)
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string[]>>({});
  // "postId::keyword" → BriefingResult
  const [briefingResults, setBriefingResults] = useState<Record<string, BriefingResult>>({});
  const [checkingKey, setCheckingKey] = useState('');
  const [checkingStage, setCheckingStage] = useState('');
  const [extractingPostId, setExtractingPostId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // postId → 점수 결과 (규칙 기반 AI/SEO/GEO/AEO 점수, Phase 1)
  const [postScores, setPostScores] = useState<Record<string, PostScore>>({});
  const [scoringPostId, setScoringPostId] = useState('');
  const [improvePanelPostId, setImprovePanelPostId] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'briefingExposed' | 'briefingUnexposed' | 'tabExposed' | 'tabUnexposed' | 'needsImprovement' | 'highScore' | 'lowScore'
  >('all');

  const showError = useCallback((msg: string, ms = 5000) => {
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(''), ms);
  }, []);

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  const isLoggedIn = !!(user.id || user.authId);
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';

  // useAuth()가 이미 불러온 사용자 정보에서 도출 — 별도로 /api/auth/me를 다시 fetch하지 않는다.
  // (페이지 마운트 시 여러 컴포넌트가 각자 인증 확인을 중복 호출하면 미들웨어에서 동시에
  // 세션 갱신을 시도해 충돌하는 문제가 있었음 — 2026-07-17)
  const profile = useMemo<BloggerProfile | null>(() => {
    if (user.type === 'unified' && (user.blogId || user.id)) {
      return { blogId: (user.blogId || user.id)!, displayName: user.name || user.blogId || user.id || '', isInfluencer: true };
    }
    if (user.type === 'blogger' && user.id) {
      return { blogId: user.id, displayName: user.name || user.id, isInfluencer: false };
    }
    if (user.type === 'influencer' && user.id) {
      return { blogId: (user.blogId || user.id)!, displayName: user.name || user.id, isInfluencer: true };
    }
    return null;
  }, [user]);

  const handleDownload = () => {
    if (!canDownload) return;
    const headers = [
      '포스팅 제목', '포스팅 URL', '작성일', '타겟 키워드',
      'AI 브리핑', '브리핑 출처 순번', '브리핑 출처 총계',
      'AI 탭', '탭 출처 순번', '탭 출처 총계',
    ];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      const kws = postKeywords[post.id] || [];
      if (kws.length === 0) continue;
      for (const kw of kws) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const result = briefingResults[rankKey(post.id, kw)];
        // AI 브리핑/AI 탭은 서로 완전히 독립된 서비스 결과 — 각자의 필드만으로 판정한다
        // 2026-07-04(6차): 상태 문구 통일 — "없음" 문구 제거, 미확인/인용/미인용 3가지만 사용
        const briefingStatus = !result ? '미확인' : result.exposed ? '인용' : '미인용';
        const tabStatus = !result ? '미확인' : result.tabExposed ? '인용' : '미인용';
        rows.push([
          post.title,
          post.url,
          post.date,
          kw,
          briefingStatus,
          result?.sourceIndex ?? '',
          result?.sourceTotal ?? '',
          tabStatus,
          result?.tabSourceIndex ?? '',
          result?.tabSourceTotal ?? '',
        ]);
      }
      if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
    }
    if (rows.length === 0) {
      alert('다운로드할 키워드 데이터가 없습니다. 먼저 타겟 키워드를 등록하고 확인해주세요.');
      return;
    }
    const csv = rowsToCsv(headers, rows);
    downloadCsvInBrowser(`my_naver_mate_${todayStamp()}.csv`, csv);
  };

  const handleResetResults = useCallback(async () => {
    if (!profile) return;
    if (!confirm('모든 포스팅의 타겟 키워드와 AI 브리핑 확인 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    try {
      setEditingKeywords(prev => {
        const updated = { ...prev };
        if (blogPosts && blogPosts.length > 0) {
          blogPosts.forEach(post => { updated[post.id] = ['']; });
        }
        return updated;
      });
      setPostKeywords({});
      setBriefingResults({});

      await fetch(`${STATE_API}?all=true`, { method: 'DELETE' }).catch(() => null);

      showError('모든 타겟 키워드와 AI 브리핑 데이터가 초기화되었습니다.', 3000);
    } catch (err) {
      showError('초기화 중 오류가 발생했습니다.', 3000);
      console.error('Reset error:', err);
    }
  }, [profile, blogPosts, showError]);

  const handleClearPostKeywords = (postId: string) => {
    if (!profile) return;
    if (!confirm('이 포스팅의 모든 타겟 키워드를 삭제하시겠습니까?')) return;

    setEditingKeywords(prev => ({ ...prev, [postId]: [''] }));
    const updated = { ...postKeywords };
    delete updated[postId];
    setPostKeywords(updated);

    const newResults = { ...briefingResults };
    for (const key of Object.keys(newResults)) {
      if (key.startsWith(`${postId}::`)) delete newResults[key];
    }
    setBriefingResults(newResults);

    saveKeywordsToDb(profile.blogId, postId, []);
    showError('포스팅의 타겟 키워드가 초기화되었습니다.', 3000);
  };

  const fetchBlogPosts = useCallback(async (blogId: string, page: number = 1) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${postsPerPage}`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
        setBlogPostsTotal(data.totalCount || 0);
        setCurrentPage(page);
      }
    } catch { /* ignore */ }
    finally { setPostsLoading(false); }
  }, [postsPerPage]);

  useEffect(() => {
    if (profile?.blogId) {
      fetchBlogPosts(profile.blogId, 1);
    }
  }, [profile?.blogId, fetchBlogPosts]);

  const { data: syncedState } = useQuery({
    queryKey: ['ai-briefing-state', profile?.blogId],
    queryFn: () => fetchBriefingState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: syncedScores } = useQuery({
    queryKey: ['post-ai-scores', profile?.blogId],
    queryFn: async () => {
      const res = await fetch(`${SCORE_API}?blogId=${encodeURIComponent(profile!.blogId)}`);
      if (!res.ok) throw new Error('점수 로드 실패');
      const data: { scores: Array<{
        post_id: string; title: string | null; view_count: number | null; published_at: string | null;
        representative_keyword: string | null;
        ai_score: number; seo_score: number; geo_score: number; aeo_score: number;
        sub_scores: SubScores; cause_tags: string[]; computed_at: string;
      }> } = await res.json();
      return data.scores;
    },
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (syncedScores) {
      const map: Record<string, PostScore> = {};
      for (const s of syncedScores) {
        map[s.post_id] = {
          postId: s.post_id,
          title: s.title,
          viewCount: s.view_count,
          publishedAt: s.published_at,
          representativeKeyword: s.representative_keyword,
          aiScore: s.ai_score,
          seoScore: s.seo_score,
          geoScore: s.geo_score,
          aeoScore: s.aeo_score,
          subScores: s.sub_scores,
          causeTags: s.cause_tags,
          computedAt: s.computed_at,
        };
      }
      setPostScores(map);
    }
  }, [syncedScores]);

  const handleAnalyzeScore = useCallback(async (post: BlogPost) => {
    if (!profile) return;
    setScoringPostId(post.id);
    try {
      const res = await fetch(SCORE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: profile.blogId,
          postId: post.id,
          title: post.title,
          date: post.date,
          viewCount: post.viewCount ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showError(body?.error || 'AI 점수 분석에 실패했습니다.', 6000);
        return;
      }
      const data: {
        postId: string; representativeKeyword: string | null;
        aiScore: number; seoScore: number; geoScore: number; aeoScore: number;
        subScores: SubScores; causeTags: string[];
      } = await res.json();
      setPostScores(prev => ({
        ...prev,
        [post.id]: {
          postId: post.id,
          title: post.title,
          viewCount: post.viewCount ?? null,
          publishedAt: post.date,
          representativeKeyword: data.representativeKeyword,
          aiScore: data.aiScore,
          seoScore: data.seoScore,
          geoScore: data.geoScore,
          aeoScore: data.aeoScore,
          subScores: data.subScores,
          causeTags: data.causeTags,
          computedAt: new Date().toISOString(),
        },
      }));
    } catch {
      showError('네트워크 오류로 AI 점수를 분석하지 못했습니다.', 6000);
    } finally {
      setScoringPostId('');
    }
  }, [profile, showError]);

  useEffect(() => {
    if (syncedState) {
      // syncedState는 외부 fetch 응답(API 응답 캐시/확장프로그램 등 외부 요인에 영향받을 수 있음)이라
      // 필드가 비어있어도 postKeywords/briefingResults가 undefined가 되지 않도록 방어한다.
      // (2026-07-17: postKeywords가 undefined가 되면서 "미노출 게시글" 파생 계산이
      // postKeywords[post.id]에서 TypeError를 던져 /my 전체가 에러 화면으로 죽는 버그 확인)
      setPostKeywords(syncedState.postKeywords || {});
      setBriefingResults(syncedState.briefingResults || {});
    }
  }, [syncedState]);

  // 포스트 로드 시 타겟 키워드 초기화 (저장된 값 있으면 사용, 없으면 빈 입력 1개)
  useEffect(() => {
    if (!profile || blogPosts.length === 0) return;
    const initial: Record<string, string[]> = {};
    for (const post of blogPosts) {
      if (postKeywords[post.id] && postKeywords[post.id].length > 0) {
        initial[post.id] = [...postKeywords[post.id]];
      } else {
        initial[post.id] = [''];
      }
    }
    setEditingKeywords(prev => ({ ...prev, ...initial }));
  }, [profile, blogPosts, postKeywords]);

  const handleKeywordChange = (postId: string, kwIndex: number, value: string) => {
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || [])];
      kws[kwIndex] = value;
      return { ...prev, [postId]: kws };
    });
  };

  const handleKeywordSave = (postId: string) => {
    if (!profile) return;
    const kws = (editingKeywords[postId] || []).map(k => k.trim()).filter(Boolean);
    if (kws.length > 0) {
      setPostKeywords(prev => ({ ...prev, [postId]: kws }));
      saveKeywordsToDb(profile.blogId, postId, kws);
    }
  };

  // 포스팅 제목/본문을 분석해 대표 키워드를 자동 추출 — 입력칸만 채우고 저장은 사용자가 blur/Enter로 확정
  const handleAutoExtract = async (post: BlogPost) => {
    setExtractingPostId(post.id);
    try {
      const res = await fetch(
        `/api/blog/representative-keywords?blogId=${encodeURIComponent(profile!.blogId)}&postId=${encodeURIComponent(post.id)}&title=${encodeURIComponent(post.title)}`,
      );
      if (!res.ok) {
        showError('대표 키워드 자동 추출에 실패했습니다.', 5000);
        return;
      }
      const data: { keywords?: string[] } = await res.json();
      if (!data.keywords || data.keywords.length === 0) {
        showError('이 포스팅에서 대표 키워드를 찾지 못했습니다. 직접 입력해주세요.', 5000);
        return;
      }
      setEditingKeywords(prev => ({ ...prev, [post.id]: data.keywords!.slice(0, 5) }));
    } catch {
      showError('네트워크 오류로 대표 키워드를 추출하지 못했습니다.', 5000);
    } finally {
      setExtractingPostId('');
    }
  };

  const addKeyword = (postId: string) => {
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || []), ''];
      return { ...prev, [postId]: kws };
    });
  };

  const removeKeyword = (postId: string, kwIndex: number) => {
    if (!profile) return;
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || [])];
      kws.splice(kwIndex, 1);
      if (kws.length === 0) return prev;
      return { ...prev, [postId]: kws };
    });
    setTimeout(() => handleKeywordSave(postId), 0);
  };

  // 2026-07-04(6차) 오렌지 지시: 진행 단계를 실시간으로 보여주기 위해 NDJSON 스트리밍 응답을 소비.
  // 캐시 적중/검증 실패/접근 거부 등은 서버가 여전히 일반 JSON으로 즉시 응답하므로
  // content-type으로 분기해서 두 경로 모두 처리한다.
  const checkSingleKeyword = async (post: BlogPost, keyword: string): Promise<{ ok: boolean; status: number; cached: boolean }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0, cached: false };
    const key = rankKey(post.id, keyword.trim());
    setCheckingKey(key);
    setCheckingStage('searching');
    try {
      const res = await fetch('/api/blog/check-ai-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: profile.blogId,
          postId: post.id,
          keyword: keyword.trim(),
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          showError('요청이 너무 많습니다. 5분 후 다시 시도해주세요.');
        } else {
          const body = await res.json().catch(() => null);
          showError(body?.error || `AI 브리핑 확인 실패 (오류 ${res.status}). 잠시 후 다시 시도해주세요.`, 8000);
        }
        return { ok: false, status: res.status, cached: false };
      }

      const isStream = res.headers.get('content-type')?.includes('application/x-ndjson') && res.body;
      if (!isStream) {
        // 캐시 적중 등 — 일반 JSON 즉시 응답
        const data = await res.json();
        setBriefingResults(prev => ({ ...prev, [key]: data }));
        saveBriefingResultToDb(profile.blogId, post.id, keyword.trim(), data);
        return { ok: true, status: res.status, cached: data?.cached === true };
      }

      // NDJSON 스트림: 줄 단위로 진행 단계({stage}) 및 최종 결과({stage:'done'|'error', ...})를 수신
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: (Record<string, unknown> & { error?: string }) | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { stage?: string; error?: string; result?: Record<string, unknown> };
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.stage === 'error') {
            streamError = msg.error || 'AI 브리핑 확인 중 오류';
          } else if (msg.stage === 'done') {
            finalData = msg.result || null;
            setCheckingStage('done');
          } else if (msg.stage) {
            setCheckingStage(msg.stage);
          }
        }
      }

      if (streamError) {
        showError(streamError, 8000);
        return { ok: false, status: res.status, cached: false };
      }
      if (finalData) {
        setBriefingResults(prev => ({ ...prev, [key]: finalData as unknown as BriefingResult }));
        saveBriefingResultToDb(profile.blogId, post.id, keyword.trim(), finalData as unknown as BriefingResult);
        return { ok: true, status: res.status, cached: false };
      }
      showError('AI 브리핑 확인 결과를 받지 못했습니다. 잠시 후 다시 시도해주세요.', 8000);
      return { ok: false, status: res.status, cached: false };
    } catch {
      showError('네트워크 오류로 AI 브리핑을 확인하지 못했습니다.');
      return { ok: false, status: 0, cached: false };
    } finally {
      setCheckingKey('');
      setCheckingStage('');
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-32 bg-border/30 rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-border/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="font-title text-2xl font-extrabold">AI 브리핑 · AI 탭</h1>
        <p className="text-sm text-dim leading-relaxed">
          로그인하시면 본인의 작업 데이터를 저장하고 다른 기기에서도 이어서 작업할 수 있습니다.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/auth/login?redirect=/my/naver-mate"
            className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition-colors"
          >
            로그인
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 border border-border bg-surface font-semibold rounded-xl hover:border-accent transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  if (!profile || !profile.blogId) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="text-xl font-bold">AI 브리핑 · AI 탭</h1>
        <p className="text-sm text-dim">블로그 주소가 필요합니다.</p>
        <Link href="/profile" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl">
          마이페이지에서 블로그 연결
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(blogPostsTotal / postsPerPage);

  // 포스트 단위 노출 상태 파생 (해당 포스트에 할당된 키워드 중 하나라도 인용/미인용이면 그 상태로 판정)
  const postExposureState = (postId: string): { briefing: boolean | null; tab: boolean | null } => {
    const keywords = (postKeywords || {})[postId] || [];
    const results = keywords.map(kw => (briefingResults || {})[rankKey(postId, kw)]).filter(Boolean) as BriefingResult[];
    if (results.length === 0) return { briefing: null, tab: null };
    return {
      briefing: results.some(r => r.exposed === true) ? true : results.some(r => r.exposed === false) ? false : null,
      tab: results.some(r => r.tabExposed === true) ? true : results.some(r => r.tabExposed === false) ? false : null,
    };
  };

  const scoredPosts = Object.values(postScores);
  const kpiAvg = (key: 'aiScore' | 'seoScore' | 'geoScore' | 'aeoScore'): number =>
    scoredPosts.length === 0 ? 0 : Math.round(scoredPosts.reduce((s, p) => s + p[key], 0) / scoredPosts.length);

  const kpiExposure = blogPosts.reduce(
    (acc, post) => {
      const st = postExposureState(post.id);
      if (st.briefing === true) acc.briefingExposed++;
      if (st.briefing === false) acc.briefingUnexposed++;
      if (st.tab === true) acc.tabExposed++;
      if (st.tab === false) acc.tabUnexposed++;
      return acc;
    },
    { briefingExposed: 0, briefingUnexposed: 0, tabExposed: 0, tabUnexposed: 0 },
  );

  const FILTER_OPTIONS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'briefingExposed', label: 'AI브리핑 노출' },
    { key: 'briefingUnexposed', label: 'AI브리핑 미노출' },
    { key: 'tabExposed', label: 'AI탭 노출' },
    { key: 'tabUnexposed', label: 'AI탭 미노출' },
    { key: 'needsImprovement', label: '개선필요' },
    { key: 'highScore', label: '점수높은글' },
    { key: 'lowScore', label: '점수낮은글' },
  ];

  const filteredPosts = blogPosts.filter(post => {
    if (filter === 'all') return true;
    const st = postExposureState(post.id);
    const score = postScores[post.id];
    switch (filter) {
      case 'briefingExposed': return st.briefing === true;
      case 'briefingUnexposed': return st.briefing === false;
      case 'tabExposed': return st.tab === true;
      case 'tabUnexposed': return st.tab === false;
      case 'needsImprovement': return !!score && score.aiScore < 60;
      case 'highScore': return !!score && score.aiScore >= 70;
      case 'lowScore': return !!score && score.aiScore < 40;
      default: return true;
    }
  });

  // 성공사례: exposed/tabExposed=true 항목을 조회수 내림차순으로
  const successCases = blogPosts
    .filter(post => {
      const st = postExposureState(post.id);
      return st.briefing === true || st.tab === true;
    })
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {errorMessage && (
        <div className="px-4 py-3 rounded-xl bg-down/10 border border-down/30 text-down text-sm flex items-start gap-2">
          <span className="font-bold shrink-0">!</span>
          <span className="flex-1">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage('')}
            className="text-down/70 hover:text-down cursor-pointer text-xs shrink-0"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}
      {checkingKey && (
        <div className="px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block shrink-0" />
          <span className="flex-1">{STAGE_LABELS[checkingStage] || '확인 중...'}</span>
        </div>
      )}
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-title text-2xl font-extrabold">AI 브리핑 · AI 탭</h1>
          <p className="text-sm text-dim mt-1">
            포스팅별 타겟 키워드를 지정하고 네이버 AI 브리핑(생성형 검색 답변) 인용 여부를 확인하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canDownload && (
            <button
              onClick={handleDownload}
              disabled={blogPosts.length === 0}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
              title="현재 페이지 포스팅의 AI 브리핑 확인 결과를 CSV 다운로드 (최대 500건)"
            >
              CSV 다운로드
            </button>
          )}
          <button
            onClick={handleResetResults}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
            title="모든 타겟 키워드와 AI 브리핑 데이터 초기화"
          >
            초기화
          </button>
        </div>
      </div>

      <p className="text-xs text-dim/80 -mt-3">
        AI 브리핑(통합검색 인라인 위젯)과 AI 탭은 서로 완전히 다른 별개 서비스입니다 — 실제 브라우저로 두 화면을 순차 방문해
        각각 콘텐츠 생성 여부와 내 게시글의 출처 인용 여부를 독립적으로 확인하기 때문에 건당 30~50초 정도 걸릴 수 있습니다.
        한 번에 한 포스팅씩만 확인해주세요 — 짧은 시간에 반복 확인하면 네이버 측에서 일시적으로 접근이 제한될 수 있습니다.
        같은 키워드라도 검색 시점에 따라 두 서비스 각각의 노출 여부와 출처 목록이 서로 다르게 나타날 수 있습니다.
      </p>

      {/* KPI 바 — 현재 페이지 로드된 포스팅 기준(전체 블로그 합산 아님) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnimatedStatCard label="전체 포스팅" value={blogPosts.length} description="현재 페이지 기준" color="dim" />
        <AnimatedStatCard label="AI브리핑 노출" value={kpiExposure.briefingExposed} color="up" />
        <AnimatedStatCard label="AI브리핑 미노출" value={kpiExposure.briefingUnexposed} color="down" />
        <AnimatedStatCard label="AI탭 노출" value={kpiExposure.tabExposed} color="up" />
        <AnimatedStatCard label="AI탭 미노출" value={kpiExposure.tabUnexposed} color="down" />
        <AnimatedStatCard label="평균 AI점수" value={kpiAvg('aiScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
        <AnimatedStatCard label="평균 SEO점수" value={kpiAvg('seoScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
        <AnimatedStatCard label="평균 GEO점수" value={kpiAvg('geoScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
        <AnimatedStatCard label="평균 AEO점수" value={kpiAvg('aeoScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
      </div>

      {/* 성공사례 — 인용/노출 확인된 항목을 조회수 내림차순으로 */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30">
          <h3 className="font-bold text-[15px]">성공사례</h3>
          <p className="text-[11px] text-dim mt-0.5">
            AI 브리핑 또는 AI 탭에 인용된 게시글 (조회수순). 조회수 증가율·클릭률은 히스토리 기능(준비 중) 완성 후 제공됩니다.
          </p>
        </div>
        {successCases.length === 0 ? (
          <div className="py-8 text-center text-dim text-sm">아직 확인된 성공사례가 없습니다.</div>
        ) : (
          <div className="divide-y divide-border/20">
            {successCases.map(post => {
              const st = postExposureState(post.id);
              return (
                <div key={post.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                    className="font-semibold text-sm hover:text-accent transition truncate block max-w-[420px]" title={post.title}>
                    {post.title}
                  </a>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {typeof post.viewCount === 'number' && (
                      <span className="text-[10px] text-dim">조회수 {post.viewCount.toLocaleString()}</span>
                    )}
                    {st.briefing === true && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-up/10 text-up">AI브리핑 인용</span>
                    )}
                    {st.tab === true && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-up/10 text-up">AI탭 노출</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* 최근 변경 내역 — Phase 2 예정 (일별 스냅샷 히스토리 테이블 필요) */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30">
          <h3 className="font-bold text-[15px]">최근 변경 내역</h3>
        </div>
        <div className="py-8 text-center text-dim text-sm">히스토리 기능은 준비 중입니다.</div>
      </GlassCard>

      {/* 포스팅 수 선택 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-0.5">
          {[30, 60, 90].map(n => (
            <button key={n} onClick={() => { setPostsPerPage(n); setCurrentPage(1); if (profile) fetchBlogPosts(profile.blogId, 1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                postsPerPage === n ? 'bg-accent text-white' : 'text-dim hover:text-text'
              }`}
            >
              {n}개
            </button>
          ))}
        </div>
        <span className="text-xs text-dim">
          총 {blogPostsTotal.toLocaleString()}개 포스팅
        </span>
      </div>

      {/* 필터 (현재 로드된 페이지 데이터 기준 클라이언트 사이드 필터) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              filter === opt.key
                ? 'bg-accent text-white border-accent'
                : 'bg-surface text-dim border-border hover:border-accent/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <GlassCard padding="none">
        {postsLoading ? (
          <div className="p-12 text-center text-dim text-sm">포스팅을 불러오는 중...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-12 text-center text-dim text-sm">포스팅이 없습니다.</div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                    <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-28">대표키워드</th>
                    <th className="text-left px-3 py-3 font-semibold w-40">타겟 키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">AI브리핑</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">AI탭</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">AI</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">SEO</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">GEO</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">AEO</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">조회수</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">발행일</th>
                    <th className="text-center px-3 py-3 font-semibold w-14">확인</th>
                    <th className="text-center px-3 py-3 font-semibold w-24">개선하기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filteredPosts.map((post, i) => {
                    const keywords = editingKeywords[post.id] || [];
                    const rowCount = Math.max(keywords.length, 1);
                    const score = postScores[post.id];
                    return keywords.map((kw, kwIdx) => {
                      const key = rankKey(post.id, kw.trim());
                      const result = briefingResults[key];
                      const isFirst = kwIdx === 0;
                      const isLast = kwIdx === rowCount - 1;
                      return (
                        <>
                        <tr key={`${post.id}-${kwIdx}`} className={`hover:bg-surface-hover transition ${!isLast ? '!border-b-0' : ''}`}>
                          {isFirst && (
                            <>
                              <td className="px-4 py-3 text-dim text-xs align-top" rowSpan={rowCount}>
                                {(currentPage - 1) * postsPerPage + i + 1}
                              </td>
                              <td className="px-3 py-3 align-top" rowSpan={rowCount}>
                                <a href={post.url} target="_blank" rel="noopener noreferrer"
                                  className="font-semibold hover:text-accent transition truncate block max-w-[280px]" title={post.title}>
                                  {post.title}
                                </a>
                                <div className="flex items-center gap-1.5 mt-1">
                                  {post.commentCount > 0 && (
                                    <span className="text-[10px] text-accent">댓글 {post.commentCount}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {!keywords.some(k => k.trim()) && (
                                    <button onClick={() => handleAutoExtract(post)}
                                      disabled={extractingPostId === post.id}
                                      className="text-xs text-accent cursor-pointer hover:underline disabled:opacity-50">
                                      {extractingPostId === post.id ? '추출 중...' : '자동 추출'}
                                    </button>
                                  )}
                                  {keywords.length < 5 && (
                                    <button onClick={() => addKeyword(post.id)}
                                      className="text-xs text-accent cursor-pointer hover:underline">
                                      + 키워드 추가
                                    </button>
                                  )}
                                  {keywords.some(k => k.trim()) && (
                                    <button onClick={() => handleClearPostKeywords(post.id)}
                                      className="text-xs text-down/60 hover:text-down cursor-pointer hover:underline">
                                      초기화
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3 align-top" rowSpan={rowCount}>
                                <span className="text-xs text-dim">{score?.representativeKeyword || '—'}</span>
                              </td>
                            </>
                          )}
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={kw}
                                onChange={e => handleKeywordChange(post.id, kwIdx, e.target.value)}
                                onBlur={() => handleKeywordSave(post.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleKeywordSave(post.id);
                                    checkSingleKeyword(post, kw);
                                  }
                                }}
                                className="flex-1 px-2 py-1.5 text-xs bg-bg border border-border rounded-lg focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                                placeholder="타겟 키워드"
                              />
                              {keywords.length > 1 && (
                                <button onClick={() => removeKeyword(post.id, kwIdx)}
                                  className="text-dim hover:text-down text-xs cursor-pointer shrink-0 px-1">
                                  x
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="text-center px-3 py-1.5">
                            <BriefingLabelBadge result={result} />
                          </td>
                          <td className="text-center px-3 py-1.5">
                            <AiTabBadge result={result} />
                          </td>
                          {isFirst && (
                            <>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.aiScore} />
                              </td>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.seoScore} />
                              </td>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.geoScore} />
                              </td>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.aeoScore} />
                              </td>
                              <td className="text-center px-3 py-1.5 align-top text-xs text-dim" rowSpan={rowCount}>
                                {typeof post.viewCount === 'number' ? post.viewCount.toLocaleString() : '—'}
                              </td>
                              <td className="text-center px-3 py-1.5 align-top text-[10px] text-dim" rowSpan={rowCount}>
                                {post.date}
                              </td>
                            </>
                          )}
                          <td className="text-center px-3 py-1.5">
                            <button
                              onClick={() => checkSingleKeyword(post, kw)}
                              disabled={!!checkingKey || !kw.trim()}
                              className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                            >
                              {checkingKey === key ? (
                                <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                              ) : result ? '재확인' : '확인'}
                            </button>
                          </td>
                          {isFirst && (
                            <td className="text-center px-3 py-1.5 align-top" rowSpan={rowCount}>
                              {!score ? (
                                <button
                                  onClick={() => handleAnalyzeScore(post)}
                                  disabled={scoringPostId === post.id}
                                  className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                                >
                                  {scoringPostId === post.id ? '분석 중...' : '분석하기'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setImprovePanelPostId(prev => prev === post.id ? '' : post.id)}
                                  className="text-[11px] text-accent hover:underline cursor-pointer"
                                >
                                  개선하기<br /><span className="text-[9px] text-dim">(기초 진단)</span>
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                        {isFirst && score && score.causeTags.length > 0 && (
                          <tr key={`${post.id}-causes`} className={!isLast ? '!border-b-0' : ''}>
                            <td colSpan={2} />
                            <td colSpan={12} className="px-3 pb-2 pt-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                {score.causeTags.map(tag => (
                                  <span key={tag} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-down/10 text-down">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        {isFirst && improvePanelPostId === post.id && score && (
                          <tr key={`${post.id}-improve`} className={!isLast ? '!border-b-0' : ''}>
                            <td colSpan={14} className="px-4 pb-4 pt-1 bg-bg/30">
                              <ImprovePanel score={score} />
                            </td>
                          </tr>
                        )}
                        </>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {filteredPosts.map((post, i) => {
                const keywords = editingKeywords[post.id] || [];
                const score = postScores[post.id];
                return (
                  <div key={post.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">
                        {(currentPage - 1) * postsPerPage + i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">
                          {post.title}
                        </a>
                        <span className="text-[10px] text-dim ml-1">{post.date}</span>
                      </div>
                    </div>

                    <div className="pl-7 flex items-center gap-2 flex-wrap text-[10px] text-dim">
                      {score?.representativeKeyword && (
                        <span className="px-1.5 py-0.5 rounded-full bg-bg border border-border">대표키워드: {score.representativeKeyword}</span>
                      )}
                      {typeof post.viewCount === 'number' && <span>조회수 {post.viewCount.toLocaleString()}</span>}
                    </div>

                    {score && (
                      <div className="pl-7 flex items-center gap-3 text-[11px]">
                        <span>AI <b className={scoreColor(score.aiScore)}>{score.aiScore}</b></span>
                        <span>SEO <b className={scoreColor(score.seoScore)}>{score.seoScore}</b></span>
                        <span>GEO <b className={scoreColor(score.geoScore)}>{score.geoScore}</b></span>
                        <span>AEO <b className={scoreColor(score.aeoScore)}>{score.aeoScore}</b></span>
                      </div>
                    )}

                    {score && score.causeTags.length > 0 && (
                      <div className="pl-7 flex items-center gap-1 flex-wrap">
                        {score.causeTags.map(tag => (
                          <span key={tag} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-down/10 text-down">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1.5 pl-7">
                      {keywords.map((kw, kwIdx) => {
                        const key = rankKey(post.id, kw.trim());
                        const result = briefingResults[key];
                        return (
                          <div key={kwIdx} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={kw}
                                onChange={e => handleKeywordChange(post.id, kwIdx, e.target.value)}
                                onBlur={() => handleKeywordSave(post.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleKeywordSave(post.id);
                                    checkSingleKeyword(post, kw);
                                  }
                                }}
                                className="flex-1 px-2.5 py-1.5 text-sm bg-bg border border-border rounded-lg focus:border-accent outline-none"
                                placeholder="타겟 키워드"
                              />
                              <button
                                onClick={() => checkSingleKeyword(post, kw)}
                                disabled={!!checkingKey || !kw.trim()}
                                className="px-2.5 py-1.5 text-[11px] text-accent border border-accent/30 rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
                              >
                                {checkingKey === key ? (
                                  <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                                ) : result ? '재확인' : '확인'}
                              </button>
                              {keywords.length > 1 && (
                                <button onClick={() => removeKeyword(post.id, kwIdx)}
                                  className="text-dim hover:text-down text-xs cursor-pointer px-1">
                                  x
                                </button>
                              )}
                            </div>
                            {result && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-dim">브리핑</span>
                                <BriefingLabelBadge result={result} />
                                <span className="text-[10px] text-dim">탭</span>
                                <AiTabBadge result={result} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 flex-wrap">
                        {!keywords.some(k => k.trim()) && (
                          <button onClick={() => handleAutoExtract(post)}
                            disabled={extractingPostId === post.id}
                            className="text-xs text-accent cursor-pointer hover:underline disabled:opacity-50">
                            {extractingPostId === post.id ? '추출 중...' : '자동 추출'}
                          </button>
                        )}
                        {keywords.length < 5 && (
                          <button onClick={() => addKeyword(post.id)}
                            className="text-xs text-accent cursor-pointer hover:underline">
                            + 키워드 추가
                          </button>
                        )}
                        {keywords.some(k => k.trim()) && (
                          <button onClick={() => handleClearPostKeywords(post.id)}
                            className="text-xs text-down/60 hover:text-down cursor-pointer hover:underline">
                            초기화
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pl-7 pt-0.5">
                      {!score ? (
                        <button
                          onClick={() => handleAnalyzeScore(post)}
                          disabled={scoringPostId === post.id}
                          className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {scoringPostId === post.id ? 'AI 점수 분석 중...' : 'AI 점수 분석하기'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setImprovePanelPostId(prev => prev === post.id ? '' : post.id)}
                          className="text-[11px] text-accent hover:underline cursor-pointer"
                        >
                          개선하기 <span className="text-dim">(기초 진단)</span>
                        </button>
                      )}
                      {improvePanelPostId === post.id && score && (
                        <div className="mt-2">
                          <ImprovePanel score={score} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); if (profile) fetchBlogPosts(profile.blogId, Math.max(1, currentPage - 1)); }}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
                >
                  이전
                </button>
                <span className="text-xs text-dim">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); if (profile) fetchBlogPosts(profile.blogId, Math.min(totalPages, currentPage + 1)); }}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
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
