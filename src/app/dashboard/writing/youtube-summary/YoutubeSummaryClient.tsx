'use client';

import { useState } from 'react';

interface SourceInfo {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  thumbnail: string | null;
  transcriptLang: string;
  transcriptLength: number;
  truncated: boolean;
}

export default function YoutubeSummaryClient() {
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [includeSource, setIncludeSource] = useState(true);

  function buildSourceFooter(s: SourceInfo): string {
    return `\n\n---\n📺 출처\n- 영상 제목: ${s.title}\n- 채널: ${s.channel}\n- 링크: ${s.url}\n\n⚠️ 본 정리는 영상 내용을 요약·정돈한 것이며 모든 저작권은 원작자에게 있습니다. 블로그 게시 시 반드시 출처를 함께 표기해주세요.`;
  }

  async function runSummarize() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('유튜브 영상 URL을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    setSummary(null);
    setSource(null);

    try {
      const res = await fetch('/api/writing/youtube-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 402) setError(data.error || '구독 플랜이 필요합니다.');
        else if (res.status === 429) setError(data.error || '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        else setError(data.error || '정리 중 오류가 발생했습니다.');
        return;
      }

      setSummary(data.summary);
      setSource(data.source);
      if (data.source?.truncated) {
        setInfo('자막이 매우 길어 일부만 처리되었습니다. 영상의 앞부분 위주로 정리되었어요.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '정리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setUrl('');
    setSummary(null);
    setSource(null);
    setError(null);
    setInfo(null);
  }

  async function copyResult() {
    if (!summary) return;
    try {
      // 서버 응답에 이미 출처 footer가 포함되어 있으나, 사용자가 체크 해제하면 footer 제거
      let out = summary;
      if (!includeSource) {
        // "---" 또는 "📺 출처" 이후 잘라내기 (가장 마지막 등장 기준)
        const cutIdx = Math.max(out.lastIndexOf('\n---'), out.lastIndexOf('📺 출처') - 0);
        if (cutIdx > 0) out = out.slice(0, cutIdx).trimEnd();
      } else if (source) {
        // 혹시 footer가 누락되어 있으면 클라이언트에서 보강
        if (!out.includes('출처') && !out.includes('---')) {
          out = out + buildSourceFooter(source);
        }
      }
      await navigator.clipboard.writeText(out);
      setInfo(includeSource ? '출처와 함께 복사했습니다.' : '본문만 복사했습니다 (출처 표기를 잊지 마세요!).');
    } catch {
      setError('클립보드 복사에 실패했습니다.');
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text">유튜브 자막추출</h1>
        <p className="text-sm text-dim mt-1">
          유튜브 영상의 자막을 추출해 블로그 작성에 참고할 수 있도록 정리합니다. 블로거+·인플루언서 플랜 무제한 이용.
        </p>
      </header>

      {/* ── 안내 박스 ── */}
      <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
        <div className="font-semibold mb-1.5 flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          저작권 안내
        </div>
        <ul className="space-y-1 list-disc list-inside text-amber-900/90 text-[13px]">
          <li>본 도구는 영상 내용을 정리만 도와주는 보조 도구이며, 새로운 글을 자동 생성하지 않습니다.</li>
          <li>정리된 결과를 블로그에 게시할 때는 <strong>반드시 영상 출처(제목·채널·링크)를 표기</strong>해주세요.</li>
          <li>모든 저작권은 원작자에게 있으며, 무단 전재·복제로 인한 분쟁 책임은 사용자에게 있습니다.</li>
          <li>자막이 없는 영상은 처리할 수 없습니다 (한국어/영어 자동 자막 지원).</li>
        </ul>
      </div>

      <div className="bg-surface rounded-2xl border border-border p-4 sm:p-6">
        {/* 입력 + 툴바 */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/xxxxxxxxxxx 또는 https://www.youtube.com/watch?v=..."
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading && url.trim()) runSummarize();
            }}
            className="flex-1 px-4 py-2 border border-border rounded-lg bg-bg text-text text-sm focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              onClick={runSummarize}
              disabled={loading || !url.trim()}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? '정리 중…' : '정리하기'}
            </button>
            <button
              onClick={resetAll}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-border bg-white hover:bg-bg text-sm text-text disabled:opacity-50 transition-colors"
            >
              초기화
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
            {info}
          </div>
        )}

        {/* 결과 영역 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-dim">정리 결과</label>
            {summary && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-text cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSource}
                    onChange={(e) => setIncludeSource(e.target.checked)}
                    className="w-3.5 h-3.5 accent-accent"
                  />
                  출처 함께 복사 (권장)
                </label>
                <button
                  onClick={copyResult}
                  className="px-3 py-1 rounded-md border border-accent/40 bg-accent/5 hover:bg-accent/10 text-xs text-accent font-semibold transition-colors"
                >
                  결과 복사
                </button>
              </div>
            )}
          </div>

          <div className="w-full min-h-[480px] p-4 sm:p-6 border border-border rounded-lg bg-bg overflow-auto">
            {!summary && !loading && (
              <div className="h-[440px] flex flex-col items-center justify-center text-dim text-sm gap-2">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="opacity-30">
                  <rect x="2" y="6" width="20" height="14" rx="3" />
                  <path d="m10 11 5 3-5 3z" fill="currentColor" />
                </svg>
                <span>위에 유튜브 URL을 붙여넣고 "정리하기"를 눌러주세요.</span>
              </div>
            )}
            {loading && (
              <div className="h-[440px] flex flex-col items-center justify-center text-dim text-sm gap-3">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span>자막을 가져와 AI가 정리 중입니다…</span>
                <span className="text-xs text-dim/70">최대 60초 소요될 수 있어요</span>
              </div>
            )}
            {summary && (
              <>
                {source && (
                  <div className="flex gap-3 items-start mb-4 pb-4 border-b border-border">
                    {source.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={source.thumbnail}
                        alt={source.title}
                        className="w-32 sm:w-40 rounded-md border border-border shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-text hover:text-accent transition-colors line-clamp-2"
                      >
                        {source.title}
                      </a>
                      <p className="text-xs text-dim mt-1">{source.channel}</p>
                      <p className="text-[11px] text-dim mt-2">
                        자막 {source.transcriptLang === 'ko' ? '한국어' : '영어'} ·{' '}
                        {source.transcriptLength.toLocaleString()}자
                        {source.truncated && ' (일부만 처리)'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="text-sm text-text leading-relaxed whitespace-pre-wrap font-sans">
                  {summary}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
