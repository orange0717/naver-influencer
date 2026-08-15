'use client';
import { useState } from 'react';

interface RecommendedKeyword {
  keyword: string;
  volume: { total: number; pc: number; mobile: number };
  competition: { level: '낮음' | '중간' | '높음'; score: number };
  trend: { direction: 'up' | 'down' | 'stable'; change: number };
  blogCount: number | null;
  aiBriefingExposed: boolean;
  score: number;
  reasons: string[];
}

const COMP_COLOR: Record<string, string> = {
  '낮음': 'text-up',
  '중간': 'text-warning',
  '높음': 'text-down',
};

const TREND_ICON: Record<string, string> = { up: '▲', down: '▼', stable: '－' };
const TREND_COLOR: Record<string, string> = { up: 'text-up', down: 'text-down', stable: 'text-dim' };

function scoreColor(score: number) {
  if (score >= 70) return 'text-up';
  if (score >= 40) return 'text-warning';
  return 'text-dim';
}

export default function KeywordRecommendPage() {
  const [input, setInput] = useState('');
  const [seedKeyword, setSeedKeyword] = useState('');
  const [results, setResults] = useState<RecommendedKeyword[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSearch = async () => {
    const kw = input.trim();
    if (!kw || loading) return;
    setLoading(true);
    setError(null);
    setDone(false);
    setResults([]);
    setSeedKeyword(kw);

    try {
      const res = await fetch(`/api/keywords/recommend?keyword=${encodeURIComponent(kw)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '추천에 실패했습니다.');
      } else {
        setResults(data.recommendations || []);
        setDone(true);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="type-page-title">키워드 추천</h1>
        <p className="text-xs text-dim">지금 써야 하는 키워드를 AI가 점수와 이유로 설명합니다</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-semibold">키워드 입력</label>
            <div className="flex gap-2 mt-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="예) 강아지 사료"
                className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !input.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
              >
                {loading ? '분석 중...' : '추천받기'}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-dim/70 leading-relaxed">
            검색량·경쟁도·트렌드는 네이버 검색광고/데이터랩 API, 블로그 발행량은 네이버 검색 API,
            AI브리핑 노출은 사용자들이 확인한 기록을 기준으로 계산합니다.
          </p>
        </div>

        <div className="flex flex-col justify-center">
          {!done && !loading && (
            <div className="text-center py-10 bg-surface border border-border rounded-lg h-full flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
              </div>
              <div>
                <p className="text-base font-bold text-text mb-1">키워드 1개를 입력하세요</p>
                <p className="text-xs text-dim leading-relaxed">
                  예) 강아지 사료 → 강아지 사료 추천, 노령견 사료...<br />연관 키워드를 추천 점수순으로 보여드립니다
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-10 bg-surface border border-border rounded-lg h-full">
              <div className="text-center">
                <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
                <p className="text-xs text-dim">&ldquo;{seedKeyword}&rdquo; 분석 중...</p>
                <p className="text-[11px] text-dim/60 mt-1">검색량·트렌드·경쟁도·발행량을 종합 분석 중</p>
              </div>
            </div>
          )}

          {done && (
            <div className="bg-surface border border-border rounded-lg p-5 h-full flex flex-col justify-center gap-2">
              <div className="text-center">
                <p className="text-2xl font-extrabold font-rank text-accent">{results.length}</p>
                <p className="text-xs text-dim mt-0.5">&ldquo;{seedKeyword}&rdquo; 추천 키워드</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {done && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={r.keyword + i} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-dim font-rank shrink-0">#{i + 1}</span>
                  <span className="font-bold text-[16px] truncate">{r.keyword}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-lg font-extrabold font-rank ${scoreColor(r.score)}`}>{r.score}</span>
                  <span className="text-xs text-dim">점</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dim mb-2.5">
                <span>검색량 <span className="text-text font-bold font-rank">{fmt(r.volume.total)}</span>회</span>
                <span>경쟁도 <span className={`font-bold ${COMP_COLOR[r.competition.level]}`}>{r.competition.level}</span></span>
                <span>
                  트렌드 <span className={`font-bold ${TREND_COLOR[r.trend.direction]}`}>
                    {TREND_ICON[r.trend.direction]} {r.trend.change !== 0 ? `${r.trend.change}%` : ''}
                  </span>
                </span>
                <span>블로그 발행 {r.blogCount !== null ? <span className="text-text font-bold font-rank">{fmt(r.blogCount)}</span> : <span className="text-dim">-</span>}건</span>
                {r.aiBriefingExposed && <span className="text-accent font-bold">AI브리핑 노출</span>}
              </div>

              {r.reasons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {r.reasons.map((reason) => (
                    <span key={reason} className="text-[11px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                      ✔ {reason}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
