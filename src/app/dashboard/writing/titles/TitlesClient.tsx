'use client';
import { useState } from 'react';

interface GeneratedTitle {
  title: string;
  seoScore: number;
  ctrScore: number;
  aiExposureScore: number;
  naverFitScore: number;
}

function avgScore(t: GeneratedTitle) {
  return Math.round((t.seoScore + t.ctrScore + t.aiExposureScore + t.naverFitScore) / 4);
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-up';
  if (score >= 60) return 'text-warning';
  return 'text-dim';
}

export default function TitlesClient() {
  const [input, setInput] = useState('');
  const [seedKeyword, setSeedKeyword] = useState('');
  const [titles, setTitles] = useState<GeneratedTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    const kw = input.trim();
    if (!kw || loading) return;
    setLoading(true);
    setError(null);
    setTitles([]);
    setSeedKeyword(kw);

    try {
      const res = await fetch(`/api/keywords/titles?keyword=${encodeURIComponent(kw)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '제목 생성에 실패했습니다.');
      } else {
        setTitles(data.titles || []);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (title: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(title);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-title text-xl font-bold text-text">제목 생성</h1>
        <p className="text-sm text-dim">SEO·AEO·GEO를 고려한 제목 후보를 AI가 생성하고 점수까지 매겨드립니다</p>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
          placeholder="예) 아이폰17"
          className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !input.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
        >
          {loading ? '생성 중...' : '제목 생성'}
        </button>
      </div>
      <p className="text-[11px] text-dim/70 leading-relaxed">
        SEO(네이버 검색 최적화)·클릭률 예상·AI노출확률·네이버 적합도 4개 지표로 채점합니다.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-2xl">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">&ldquo;{seedKeyword}&rdquo; 제목 20개 생성 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">연관 검색어 수집 → AI 제목 생성·채점 중</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {titles.length > 0 && (
        <div className="space-y-2">
          {titles.map((t, i) => (
            <div key={t.title + i} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-dim font-rank shrink-0">#{i + 1}</span>
                  <span className="font-bold text-[15px]">{t.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-lg font-extrabold font-rank ${scoreColor(avgScore(t))}`}>{avgScore(t)}</span>
                  <button
                    onClick={() => handleCopy(t.title, i)}
                    className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-2.5 py-1 hover:bg-accent hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedIdx === i ? '복사됨' : '복사'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dim">
                <span>SEO <span className={`font-bold font-rank ${scoreColor(t.seoScore)}`}>{t.seoScore}</span></span>
                <span>클릭률 <span className={`font-bold font-rank ${scoreColor(t.ctrScore)}`}>{t.ctrScore}</span></span>
                <span>AI노출 <span className={`font-bold font-rank ${scoreColor(t.aiExposureScore)}`}>{t.aiExposureScore}</span></span>
                <span>네이버적합도 <span className={`font-bold font-rank ${scoreColor(t.naverFitScore)}`}>{t.naverFitScore}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
