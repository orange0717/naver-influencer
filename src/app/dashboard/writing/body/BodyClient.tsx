'use client';
import { useState } from 'react';

interface BodyResult {
  title: string;
  keyword: string;
  markdown: string;
  charCount: number;
  headings: string[];
  relatedKeywords: string[];
}

export default function BodyClient() {
  const [title, setTitle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showStyleInput, setShowStyleInput] = useState(false);
  const [existingPosts, setExistingPosts] = useState(['', '', '']);
  const [result, setResult] = useState<BodyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch('/api/keywords/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t,
          keyword: keyword.trim(),
          existingPosts: existingPosts.map((p) => p.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '본문 생성에 실패했습니다.');
      } else {
        setResult(data);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="type-page-title text-text">본문 생성</h1>
        <p className="text-sm text-dim">E-E-A-T와 AI검색 최적화를 반영한 블로그 본문 초안을 AI가 작성합니다</p>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="text-sm font-semibold">제목 <span className="text-down">*</span></label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 제주도투어패스 vs 제주프리패스 어떤 게 더 이득일까"
            className="w-full mt-1.5 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-semibold">핵심 키워드 <span className="text-dim font-normal">(선택)</span></label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예) 제주도 여행"
            className="w-full mt-1.5 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="border border-border rounded-xl">
          <button
            type="button"
            onClick={() => setShowStyleInput((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-text cursor-pointer"
          >
            <span>내 문체 반영 <span className="text-dim font-normal">(선택 · 기존 글 붙여넣기)</span></span>
            <span className="text-dim text-xs">{showStyleInput ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {showStyleInput && (
            <div className="px-4 pb-3.5 space-y-2.5">
              <p className="text-xs text-dim leading-relaxed">
                평소 쓰던 글을 1~3개 붙여넣으면 그 말투와 구성 방식을 분석해 새 본문에 반영합니다. 내용을 그대로 베끼는 게 아니라 문체 참고용입니다.
              </p>
              {existingPosts.map((post, i) => (
                <textarea
                  key={i}
                  value={post}
                  onChange={(e) => {
                    const next = [...existingPosts];
                    next[i] = e.target.value;
                    setExistingPosts(next);
                  }}
                  placeholder={`기존 글 ${i + 1} (선택)`}
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-surface border border-border rounded-lg text-xs text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-y"
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !title.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
        >
          {loading ? '본문 작성 중...' : '본문 생성'}
        </button>
      </div>
      <p className="text-[11px] text-dim/70 leading-relaxed">
        ⚠️ 이 글은 AI가 작성한 초안(예시)입니다. 직접 겪은 경험·사진·최신 정보를 더해 반드시 본인이 직접 검토·수정한 뒤 본인만의 글로 발행해주세요. 의료·법률·금융 등 전문 분야는 특히 주의해주세요.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-lg">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">본문 작성 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">1,800~2,500자 초안 생성에 시간이 걸릴 수 있습니다</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-dim">
              약 <span className="text-text font-bold font-rank">{result.charCount.toLocaleString()}</span>자 · 소제목 {result.headings.length}개
            </span>
            <button
              onClick={handleCopy}
              className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white transition-colors cursor-pointer"
            >
              {copied ? '복사됨' : '전체 복사'}
            </button>
          </div>
          <div className="bg-surface border border-border rounded-lg p-5">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-text leading-relaxed">{result.markdown}</pre>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-bold text-text">발행 후 다음 단계</h2>
            <p className="text-xs text-dim leading-relaxed">
              검수 후 네이버 블로그에 발행했다면, 아래에서 &ldquo;{result.title || title}&rdquo;
              {result.keyword ? ` (키워드: ${result.keyword})` : ''} 성과를 이어서 확인해보세요.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="/my/keyword-ranking"
                className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white transition-colors"
              >
                순위 확인하러 가기 →
              </a>
              <a
                href="/my/naver-mate"
                className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white transition-colors"
              >
                AI브리핑 노출 확인하러 가기 →
              </a>
              <a
                href="/dashboard/google-indexing"
                className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white transition-colors"
              >
                구글 색인등록 하러 가기 →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
