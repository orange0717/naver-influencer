'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Recommendation {
  featureId: string;
  label: string;
  href: string;
  authOnly: boolean;
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

// 카테고리 칩 — "정보 찾아줘" 처럼 아직 없는 기능(도서/기사/영상 자료조사)도 예시 문장은 보여주되,
// 실제로는 기존 카탈로그(src/lib/ai-consultant-catalog.ts) 안에서만 추천이 나온다.
// 자료조사 전용 기능 자체는 아직 구현 전 — AI가 관련도 낮음/추천 없음으로 응답할 수 있음.
const SUGGESTED_CATEGORIES: { chip: string; query: string }[] = [
  { chip: '정보 찾아줘', query: '나미야 잡화점의 기적에 대한 블로그 글을 쓰려고 하는데 자료를 찾아줘' },
  { chip: '마케팅 분석', query: '천안 미용실 마케팅을 어떻게 해야 할지 모르겠어요' },
  { chip: '콘텐츠 분석', query: '블로그 글을 썼는데 왜 노출이 안 될까요?' },
  { chip: '키워드 분석', query: '어떤 키워드로 글을 써야 할지 모르겠어요' },
];

export default function AiConsultantClient() {
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
        setError(data.error || '추천을 불러오지 못했습니다.');
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-center flex-1 space-y-1.5">
          <h1 className="font-title text-2xl font-bold text-text">N인플 AI</h1>
          <p className="text-sm text-dim">무엇을 도와드릴까요?</p>
        </div>
        {(result || error) && (
          <button
            onClick={startNew}
            className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold text-accent border border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer"
          >
            + 새 분석
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runConsult(input);
            }}
            placeholder="예: 요즘 블로그 방문자가 줄었는데 무엇부터 확인해야 할까요?"
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={() => runConsult(input)}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default shrink-0"
          >
            {loading ? '분석 중...' : 'AI에게 물어보기'}
          </button>
        </div>
        <p className="text-[11px] text-dim/70 leading-relaxed">
          마케팅, 콘텐츠, 블로그, 검색 노출에 대한 고민을 입력하면 AI가 어떤 N인플 기능이 도움이 될지 추천해드립니다.
        </p>
      </div>

      {!result && !loading && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-dim">추천 분석</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_CATEGORIES.map((c) => (
              <button
                key={c.chip}
                onClick={() => {
                  setInput(c.query);
                  runConsult(c.query);
                }}
                className="px-3.5 py-2 rounded-full border border-border bg-surface text-xs text-text hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                {c.chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-2xl">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">&ldquo;{submittedQuery}&rdquo; 분석 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">질문 의도 파악 → 관련 기능 매칭 중</p>
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
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-sm text-text leading-relaxed">{result.interpretation}</p>
          </div>

          {result.recommendations.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-dim">추천 분석</p>
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
                  <Link
                    href={rec.href}
                    className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition-colors"
                  >
                    이동
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {recent && recent.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-bold text-dim pt-3">최근 분석</p>
          <div className="space-y-1.5">
            {recent.map((item) => (
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
  );
}
