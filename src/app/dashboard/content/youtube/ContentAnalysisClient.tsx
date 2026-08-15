'use client';
import { useState } from 'react';

interface AnalyzeResult {
  contentItemId: string | null;
  video: {
    videoId: string;
    url: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedAt: string;
    durationSeconds: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
  };
  transcriptSource: 'captions' | 'stt' | 'none';
  colorPalette: string[] | null;
  analysis: {
    topic: string;
    contentType: string;
    tone: string;
    hookScore: number;
    infoScore: number;
    readabilityScore: number;
    ctaScore: number;
    chapters: { time: string; label: string }[];
    dropOffRiskNote: string;
    recurringThemes: string[];
  };
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString();
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-dim">{label}</span>
        <span className="font-bold text-text font-rank">{score.toFixed(1)} / 10</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }} />
      </div>
    </div>
  );
}

export default function ContentAnalysisClient() {
  const [url, setUrl] = useState('');
  const [useSttFallback, setUseSttFallback] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const u = url.trim();
    if (!u || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/content/youtube/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, useSttFallback }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '콘텐츠 분석에 실패했습니다.');
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
        <h1 className="type-page-title text-text">유튜브 콘텐츠 분석</h1>
        <p className="text-sm text-dim">
          영상 URL 하나로 조회수·구조·톤·컬러 팔레트를 AI가 분석합니다
        </p>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="text-sm font-semibold">유튜브 영상 URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="예) https://www.youtube.com/watch?v=xxxxxxxxxxx"
            className="w-full mt-1.5 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
          <input
            type="checkbox"
            checked={useSttFallback}
            onChange={(e) => setUseSttFallback(e.target.checked)}
            className="accent-accent"
          />
          자막이 없으면 음성 인식(STT)으로 대본을 만들어 분석 — 최대 몇 분 더 걸릴 수 있습니다
        </label>
        <button
          onClick={handleAnalyze}
          disabled={loading || !url.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
        >
          {loading ? '분석 중...' : '콘텐츠 분석'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-lg">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">영상 정보와 자막을 가져와 분석하는 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">
              {useSttFallback ? 'STT 변환은 영상 길이에 따라 몇 분 걸릴 수 있습니다' : '보통 몇십 초 내로 끝납니다'}
            </p>
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
          {/* 영상 정보 */}
          <div className="bg-surface border border-border rounded-lg p-4 flex gap-4">
            {result.video.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.video.thumbnailUrl}
                alt={result.video.title}
                className="w-32 sm:w-44 aspect-video object-cover rounded-lg shrink-0"
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-bold text-text line-clamp-2">{result.video.title}</p>
              <p className="text-xs text-dim">{result.video.channelTitle}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-dim">
                <span>조회수 {formatCount(result.video.viewCount)}</span>
                <span>좋아요 {formatCount(result.video.likeCount)}</span>
                <span>댓글 {formatCount(result.video.commentCount)}</span>
                <span>{formatDuration(result.video.durationSeconds)}</span>
              </div>
            </div>
          </div>

          {/* 콘텐츠 DNA */}
          <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-bold text-text">콘텐츠 DNA</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <div>
                <p className="text-dim">주제</p>
                <p className="font-semibold text-text mt-0.5">{result.analysis.topic || '-'}</p>
              </div>
              <div>
                <p className="text-dim">콘텐츠 유형</p>
                <p className="font-semibold text-text mt-0.5">{result.analysis.contentType || '-'}</p>
              </div>
              <div>
                <p className="text-dim">톤</p>
                <p className="font-semibold text-text mt-0.5">{result.analysis.tone || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <ScoreBar label="후킹" score={result.analysis.hookScore} />
              <ScoreBar label="정보성" score={result.analysis.infoScore} />
              <ScoreBar label="가독성(구조화)" score={result.analysis.readabilityScore} />
              <ScoreBar label="CTA" score={result.analysis.ctaScore} />
            </div>
            {result.analysis.recurringThemes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.analysis.recurringThemes.map((t, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-accent/10 text-accent font-semibold">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 컬러 팔레트 */}
          {result.colorPalette && result.colorPalette.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
              <h2 className="text-sm font-bold text-text">추천 컬러 팔레트</h2>
              <div className="flex gap-2">
                {result.colorPalette.map((hex, i) => (
                  <div key={i} className="flex-1 space-y-1 text-center">
                    <div className="w-full aspect-square rounded-lg border border-border" style={{ backgroundColor: hex }} />
                    <p className="text-[10px] text-dim font-mono">{hex}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-dim/70">썸네일에서 추출한 대표 색상입니다.</p>
            </div>
          )}

          {/* 챕터 분해 */}
          {result.analysis.chapters.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
              <h2 className="text-sm font-bold text-text">영상 구조 분석</h2>
              <ul className="space-y-1.5">
                {result.analysis.chapters.map((c, i) => (
                  <li key={i} className="flex gap-3 text-xs">
                    <span className="font-mono font-bold text-accent shrink-0">{c.time}</span>
                    <span className="text-text">{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 이탈 위험 구간 (AI 추정 — 실측 아님 명시) */}
          {result.analysis.dropOffRiskNote && (
            <div className="bg-surface border border-border rounded-lg p-5 space-y-2">
              <h2 className="text-sm font-bold text-text">이탈 가능 구간 (AI 추정)</h2>
              <p className="text-xs text-text leading-relaxed">{result.analysis.dropOffRiskNote}</p>
              <p className="text-[11px] text-dim/70 leading-relaxed">
                ⚠️ 실제 시청 유지율 데이터가 아니라 자막 텍스트 구조만으로 AI가 추정한 참고 정보입니다. 정확한
                시청 유지율은 채널 소유자 본인만 유튜브 스튜디오에서 확인할 수 있습니다.
              </p>
            </div>
          )}

          {result.transcriptSource === 'none' && (
            <p className="text-[11px] text-dim/70 leading-relaxed">
              자막을 가져오지 못해 제목·설명만으로 분석했습니다. 정확도가 낮을 수 있습니다. 위 &ldquo;음성 인식(STT)&rdquo;
              옵션을 켜고 다시 시도하면 더 정확한 분석이 가능합니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
