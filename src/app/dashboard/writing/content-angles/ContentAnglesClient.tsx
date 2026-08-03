'use client';
import { useState } from 'react';

interface AnglesResult {
  keyword: string;
  relatedKeywords: string[];
  autocomplete: string[];
  questions: string[];
  angles: string[];
}

export default function ContentAnglesClient() {
  const [input, setInput] = useState('');
  const [seedKeyword, setSeedKeyword] = useState('');
  const [result, setResult] = useState<AnglesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    const kw = input.trim();
    if (!kw || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSeedKeyword(kw);

    try {
      const res = await fetch(`/api/keywords/content-angles?keyword=${encodeURIComponent(kw)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '글감 생성에 실패했습니다.');
      } else {
        setResult(data);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-title text-xl font-bold text-text">글감찾기</h1>
        <p className="text-sm text-dim">키워드 하나로 사람들이 궁금해하는 질문과 추천 글감을 AI가 찾아드립니다</p>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="예) 다이어트"
          className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !input.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
        >
          {loading ? '분석 중...' : '글감찾기'}
        </button>
      </div>
      <p className="text-[11px] text-dim/70 leading-relaxed">
        네이버 연관검색어·자동완성 실데이터를 기반으로 AI(Claude)가 질문과 글감을 정리합니다.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-2xl">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">&ldquo;{seedKeyword}&rdquo; 관련 질문·글감 찾는 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">네이버 데이터 수집 → AI 분석 중</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {result && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-text">사람들이 궁금한 질문</h2>
            {result.questions.length === 0 ? (
              <p className="text-xs text-dim">찾은 질문이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {result.questions.map((q, i) => (
                  <li key={i} className="text-sm text-text flex items-start gap-2">
                    <span className="text-accent shrink-0">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-text">추천 글감</h2>
            {result.angles.length === 0 ? (
              <p className="text-xs text-dim">찾은 글감이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {result.angles.map((a, i) => (
                  <li key={i} className="text-sm text-text flex items-start gap-2">
                    <span className="text-accent shrink-0">✔</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(result.relatedKeywords.length > 0 || result.autocomplete.length > 0) && (
            <div className="md:col-span-2 bg-surface border border-border rounded-xl p-4">
              <p className="text-[11px] text-dim mb-2">이 글감의 근거가 된 실제 검색 데이터</p>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set([...result.relatedKeywords, ...result.autocomplete])].slice(0, 20).map((k) => (
                  <span key={k} className="text-[11px] text-dim bg-bg/60 border border-border px-2 py-0.5 rounded-full">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
