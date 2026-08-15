'use client';
import { useState } from 'react';

interface AnalyzeResult {
  contentItemId: string | null;
  platform: 'instagram_reel' | 'youtube';
  video: {
    url: string;
    caption: string;
    hashtags: string[];
    metrics: {
      viewCount: number | null;
      likeCount: number | null;
      commentCount: number | null;
    };
    hasTranscript: boolean;
    accessNote: string;
  };
  analysis: {
    topic: string;
    contentType: string;
    tone: string;
    hookScore: number;
    retentionScore: number;
    infoScore: number;
    ctaScore: number;
    beats: { time: string; label: string }[];
    hookAnalysis: string;
    improvements: string[];
    recurringThemes: string[];
  };
}

function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString();
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

const PLATFORM_LABEL: Record<AnalyzeResult['platform'], string> = {
  instagram_reel: '인스타그램 릴스',
  youtube: '유튜브 쇼츠',
};

export default function ShortformAnalysisClient() {
  const [url, setUrl] = useState('');
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
      const res = await fetch('/api/content/shortform/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
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

  const hasMetrics =
    result &&
    (result.video.metrics.viewCount !== null ||
      result.video.metrics.likeCount !== null ||
      result.video.metrics.commentCount !== null);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="type-page-title text-text">릴스·쇼츠 분석</h1>
        <p className="text-sm text-dim">
          인스타그램 릴스·유튜브 쇼츠 URL 하나로 후킹·구성·톤·개선점을 AI가 분석합니다
        </p>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="text-sm font-semibold">릴스 / 쇼츠 URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="예) https://www.instagram.com/reel/xxxx  ·  https://www.youtube.com/shorts/xxxx"
            className="w-full mt-1.5 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading || !url.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
        >
          {loading ? '분석 중...' : '콘텐츠 분석'}
        </button>
        <p className="text-[11px] text-dim/70 leading-relaxed">
          AI 에이전트가 영상을 직접 열람해 대본·화면자막·구성을 읽어옵니다. 영상 길이·플랫폼 상황에 따라
          최대 몇 분 걸릴 수 있어요.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-lg">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">AI 에이전트가 영상을 열람하고 분석하는 중...</p>
            <p className="text-[11px] text-dim/60 mt-1">몇십 초에서 몇 분까지 걸릴 수 있습니다</p>
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
          {/* 게시물 정보 */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
                {PLATFORM_LABEL[result.platform]}
              </span>
              <a
                href={result.video.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[11px] text-dim underline hover:text-accent"
              >
                원본 열기
              </a>
            </div>
            {result.video.caption && (
              <p className="text-xs text-text leading-relaxed line-clamp-4 whitespace-pre-wrap">{result.video.caption}</p>
            )}
            {hasMetrics && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-dim">
                <span>조회수 {formatCount(result.video.metrics.viewCount)}</span>
                <span>좋아요 {formatCount(result.video.metrics.likeCount)}</span>
                <span>댓글 {formatCount(result.video.metrics.commentCount)}</span>
              </div>
            )}
            {hasMetrics && (
              <p className="text-[11px] text-dim/60 leading-relaxed">
                ⚠️ 지표는 공식 API 실측이 아니라 AI 에이전트가 <b>화면에서 읽은 시점 기준</b> 값입니다. 반올림·캐싱
                등으로 실제와 다를 수 있습니다.
              </p>
            )}
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
              <ScoreBar label="후킹(첫 3초)" score={result.analysis.hookScore} />
              <ScoreBar label="지속·루프" score={result.analysis.retentionScore} />
              <ScoreBar label="정보성" score={result.analysis.infoScore} />
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

          {/* 후킹 진단 */}
          {result.analysis.hookAnalysis && (
            <div className="bg-surface border border-border rounded-lg p-5 space-y-2">
              <h2 className="text-sm font-medium text-text">오프닝 후킹 진단</h2>
              <p className="text-xs text-text leading-relaxed">{result.analysis.hookAnalysis}</p>
            </div>
          )}

          {/* 초단위 구성 */}
          {result.analysis.beats.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
              <h2 className="text-sm font-bold text-text">영상 구성 (초단위)</h2>
              <ul className="space-y-1.5">
                {result.analysis.beats.map((b, i) => (
                  <li key={i} className="flex gap-3 text-xs">
                    <span className="font-mono font-bold text-accent shrink-0 min-w-[52px]">{b.time}</span>
                    <span className="text-text">{b.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 개선 제안 */}
          {result.analysis.improvements.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5 space-y-2">
              <h2 className="text-sm font-bold text-text">다음 숏폼을 위한 개선 제안</h2>
              <ul className="space-y-1.5 list-disc list-inside">
                {result.analysis.improvements.map((s, i) => (
                  <li key={i} className="text-xs text-text leading-relaxed">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-dim/70 leading-relaxed">
                ⚠️ 지속·루프 점수와 제안은 실제 시청 유지율 데이터가 아니라 대본·구성 구조만으로 한 AI 추정입니다.
              </p>
            </div>
          )}

          {result.video.accessNote && (
            <p className="text-[11px] text-dim/70 leading-relaxed">
              열람 참고: {result.video.accessNote}
            </p>
          )}
          {!result.video.hasTranscript && (
            <p className="text-[11px] text-dim/70 leading-relaxed">
              대본(음성)을 가져오지 못해 화면 자막·캡션 위주로 분석했습니다. 정확도가 낮을 수 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
