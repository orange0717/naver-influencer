'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import MarketingSchoolCard from '@/components/MarketingSchoolCard';
import { AI_CONSULTANT_CATALOG } from '@/lib/ai-consultant-catalog';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';

interface Recommendation {
  featureId: string;
  label: string;
  href: string;
  authOnly: boolean;
  /** 네이버 비즈니스 스쿨처럼 N인플 밖 공식 사이트로 연결되는 항목 — 새 탭으로 열어야 한다.
   *  optional인 이유: 이 필드 추가 이전에 저장된 "최근 분석" 이력에는 값이 없을 수 있음. */
  external?: boolean;
  score: number;
  reason: string;
}

interface ConsultResult {
  interpretation: string;
  recommendations: Recommendation[];
}

interface RecentQuery {
  id: string;
  query: string;
  interpretation: string;
  recommendations: Recommendation[];
  created_at: string;
}

// "추천 분석" 칩 = N인플에 이미 만들어진 기능 전체 목록 (src/lib/ai-consultant-catalog.ts 그대로 재사용).
// AI에게 물어보지 않고 바로 해당 기능 페이지로 이동하는 직행 바로가기 — 카탈로그에 기능이 추가되면
// 이 목록도 자동으로 늘어난다. 외부 링크(네이버 비즈니스 스쿨)는 아래 MarketingSchoolCard가 이미
// 전용 카드로 안내하고 있어 중복을 피하려고 제외.
const FEATURE_SHORTCUTS = AI_CONSULTANT_CATALOG.filter((f) => !f.external);

export default function AiConsultantClient() {
  // AI 질문은 게스트·무료회원 모두 하루 3회까지 무료. 초과(402)하면 유료가입을 유도한다.
  // 게스트는 회원가입 모달, 로그인 무료회원은 이용권 구매 모달로 분기 (needsSignup 플래그 기준).
  const { openGate: openMemberGate } = useMemberOnlyGate();
  const { openGate: openUpgradeGate } = useTrialEndedGate();

  const [input, setInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentQuery[] | null>(null);
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);

  const loadRecent = async () => {
    try {
      const res = await fetch('/api/ai-consultant');
      const data = await res.json();
      if (res.ok) setRecent(data.items || []);
    } catch {
      // 최근 분석 목록은 부가 기능 — 실패해도 조용히 무시
    }
  };

  useEffect(() => {
    loadRecent();
  }, []);

  const runConsult = async (query: string) => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveRecentId(null);
    setSubmittedQuery(q);

    try {
      const res = await fetch('/api/ai-consultant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 하루 무료 3회 소진 → 유료가입 유도. 게스트는 회원가입, 무료회원은 이용권 구매 모달.
        if (res.status === 402 && data.quotaExceeded) {
          if (data.needsSignup) openMemberGate('/');
          else openUpgradeGate('/');
        } else {
          setError(data.error || '추천을 불러오지 못했습니다.');
        }
      } else {
        setResult(data);
        if (data.id) setActiveRecentId(data.id);
        loadRecent();
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const openRecent = (item: RecentQuery) => {
    setError(null);
    setSubmittedQuery(item.query);
    setInput(item.query);
    setResult({ interpretation: item.interpretation, recommendations: item.recommendations });
    setActiveRecentId(item.id);
  };

  const startNew = () => {
    setResult(null);
    setError(null);
    setInput('');
    setSubmittedQuery('');
    setActiveRecentId(null);
  };

  // 결과/로딩/에러가 없는 초기 화면은 ChatGPT·Claude처럼 화면 중앙에 오도록,
  // 질문을 하고 나면(결과가 생기면) 다시 일반적인 위→아래 흐름으로 전환한다.
  const isIdle = !result && !loading && !error;

  // 대화 목록(최근 분석)이 있는 로그인 사용자에게만 ChatGPT식 좌측 전용 패널을 띄운다.
  // 게스트·신규(이력 없음)는 패널 없이 기존 중앙 정렬 레이아웃 그대로. 모바일에서는
  // 좁은 화면 눌림을 피하려 패널 대신 본문 하단의 최근 분석 목록을 유지한다(아래 lg:hidden).
  const hasConversationList = !!(recent && recent.length > 0);

  // 헤더(56px) + 페이지 상하 여백을 뺀 나머지 뷰포트 안에서 정중앙에 오도록.
  // 65vh는 화면 위쪽 65%에서만 중앙 정렬돼 오히려 위로 쏠려 보였음 (2026-08-08).
  return (
    <div className={hasConversationList ? 'w-full lg:flex lg:gap-8 lg:items-start' : ''}>
      {hasConversationList && (
        <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)]">
          <button
            onClick={startNew}
            className="shrink-0 w-full px-3.5 py-2.5 rounded-lg text-xs font-bold text-accent border border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer text-center"
          >
            + 새 분석
          </button>
          <p className="text-xs font-bold text-dim shrink-0">대화 목록</p>
          <div className="space-y-1.5 overflow-y-auto pr-1">
            {recent!.map((item) => (
              <button
                key={item.id}
                onClick={() => openRecent(item)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  activeRecentId === item.id
                    ? 'border-accent text-accent bg-accent/5'
                    : 'border-border text-dim hover:border-accent hover:text-accent'
                }`}
              >
                {item.query}
              </button>
            ))}
          </div>
        </aside>
      )}

    <div className={`${hasConversationList ? 'flex-1 min-w-0' : ''} ${isIdle && !hasConversationList ? 'min-h-[calc(100dvh-8rem)] flex flex-col justify-center' : ''}`}>
    <div className="max-w-[860px] mx-auto w-full space-y-6">
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-center flex-1 space-y-1.5">
          <h1 className="font-title text-2xl font-bold text-text">N인플 AI</h1>
          <p className="text-sm text-dim">무엇을 도와드릴까요?</p>
        </div>
        {(result || error) && (
          <button
            onClick={startNew}
            className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold text-accent border border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer ${hasConversationList ? 'lg:hidden' : ''}`}
          >
            + 새 분석
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runConsult(input);
            }}
            placeholder="예: 요즘 블로그 방문자가 줄었는데 무엇부터 확인해야 할까요?"
            className="flex-1 w-full px-4 py-3.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={() => runConsult(input)}
            disabled={loading || !input.trim()}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default shrink-0"
          >
            {loading ? '분석 중...' : 'AI에게 물어보기'}
          </button>
        </div>
        <p className="text-[11px] text-dim/70 leading-relaxed">
          마케팅, 콘텐츠, 블로그, 검색 노출에 대한 고민을 입력하면 AI가 바로 답변해드리고, 관련된 N인플 기능도 함께 추천해드립니다. (무료 하루 3회)
        </p>
      </div>

      {!result && !loading && (
        <div className="space-y-2.5 pt-3 mt-2 border-t border-border/60">
          <p className="text-xs font-bold text-dim">추천 분석 — N인플 기능 바로가기</p>
          <div className="flex flex-wrap gap-2">
            {FEATURE_SHORTCUTS.map((f) => (
              <Link
                key={f.id}
                href={f.href}
                className="px-3.5 py-2 rounded-full border border-border bg-surface text-xs text-text hover:border-accent hover:text-accent transition-colors"
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AI 호출 없이 항상 노출 — 크레딧/로그인과 무관한 단순 외부 링크 안내 */}
      {!result && !loading && <MarketingSchoolCard />}

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-lg">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">&ldquo;{submittedQuery}&rdquo; 답변 생성 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">질문 분석 → AI 답변 작성 중</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-1.5 shadow-sm">
            <p className="text-[11px] font-bold text-accent">N인플 AI 답변</p>
            <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{result.interpretation}</p>
          </div>

          {result.recommendations.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-dim">함께 보면 좋은 N인플 기능</p>
              {result.recommendations.map((rec) => (
                <div
                  key={rec.featureId}
                  className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text">{rec.label}</span>
                      <span className="text-accent text-xs tracking-tight" aria-label={`관련도 ${rec.score}/5`}>
                        {'★'.repeat(rec.score)}
                        <span className="text-border">{'★'.repeat(5 - rec.score)}</span>
                      </span>
                    </div>
                    <p className="text-xs text-dim leading-relaxed">{rec.reason}</p>
                  </div>
                  {rec.external ? (
                    <a
                      href={rec.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${rec.label} 바로가기`}
                      className="shrink-0 inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition-colors"
                    >
                      바로가기
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 17L17 7" />
                        <path d="M7 7h10v10" />
                      </svg>
                    </a>
                  ) : (
                    <Link
                      href={rec.href}
                      className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition-colors"
                    >
                      이동
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 데스크톱은 좌측 대화 목록 패널로 이동 — 여기서는 모바일 화면에서만 하단 목록 노출 */}
      {hasConversationList && (
        <div className="lg:hidden space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-bold text-dim pt-3">최근 분석</p>
          <div className="space-y-1.5">
            {recent!.map((item) => (
              <button
                key={item.id}
                onClick={() => openRecent(item)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  activeRecentId === item.id
                    ? 'border-accent text-accent bg-accent/5'
                    : 'border-border text-dim hover:border-accent hover:text-accent'
                }`}
              >
                {item.query}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
  );
}
