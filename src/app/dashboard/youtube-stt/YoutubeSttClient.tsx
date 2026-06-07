'use client';

import { useMemo, useState } from 'react';

interface SourceInfo {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  thumbnail: string | null;
  source: 'caption' | 'stt';
  lang: string | null;
  durationSec: number | null;
}

interface SttResponse {
  text: string;
  source: SourceInfo;
}

type Stage = 'idle' | 'processing' | 'done';

const STAGE_LABELS: Record<Stage, string> = {
  idle: '',
  // 서버 응답 전에는 자막/STT 분기를 알 수 없어 단일 라벨로 통합. 자막 영상 1초, STT 영상 1-2분.
  processing: '처리 중… (자막이 없으면 음원 변환에 1~2분 소요)',
  done: '완료!',
};

const STAGE_PROGRESS: Record<Stage, string> = {
  idle: '0%',
  processing: '60%',
  done: '100%',
};

export default function YoutubeSttClient() {
  const [url, setUrl] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loading = stage !== 'idle' && stage !== 'done';

  const filename = useMemo(() => {
    if (!source) return 'youtube-stt.txt';
    const sanitized = source.title
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 60)
      .trim();
    return `${sanitized || source.videoId}.txt`;
  }, [source]);

  async function runExtract() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('유튜브 영상 URL을 입력해주세요.');
      return;
    }

    setError(null);
    setInfo(null);
    setText(null);
    setSource(null);
    setStage('processing');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const res = await fetch('/api/youtube/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      });

      const data = (await res.json()) as Partial<SttResponse> & { error?: string };

      if (!res.ok) {
        if (res.status === 401) setError(data.error || '로그인이 필요합니다.');
        else if (res.status === 402) setError(data.error || '구독 플랜이 필요합니다.');
        else if (res.status === 429) setError(data.error || '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        else if (res.status === 503) setError(data.error || 'STT 서비스가 아직 설정되지 않았습니다. 관리자에게 문의해주세요.');
        else if (res.status === 504) setError(data.error || '시간이 초과됐습니다. 영상이 너무 길거나 외부 서비스가 지연 중입니다.');
        else setError(data.error || '추출 중 오류가 발생했습니다.');
        setStage('idle');
        return;
      }

      if (!data.text || !data.source) {
        setError('서버 응답이 비어있습니다.');
        setStage('idle');
        return;
      }

      setText(data.text);
      setSource(data.source);
      setStage('done');
      setInfo(
        data.source.source === 'caption'
          ? `자막에서 추출했습니다 (${data.source.lang === 'ko' ? '한국어' : data.source.lang || '자동'}).`
          : '자막이 없어 음원을 STT로 변환했습니다.',
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('시간이 너무 오래 걸려 중단했습니다. 짧은 영상으로 다시 시도해주세요.');
      } else {
        setError(err instanceof Error ? err.message : '추출 중 오류가 발생했습니다.');
      }
      setStage('idle');
    } finally {
      clearTimeout(timeout);
    }
  }

  function resetAll() {
    setUrl('');
    setText(null);
    setSource(null);
    setError(null);
    setInfo(null);
    setStage('idle');
  }

  async function copyResult() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setInfo('클립보드에 복사했습니다.');
      setError(null);
    } catch {
      setError('클립보드 복사에 실패했습니다.');
      setInfo(null);
    }
  }

  function downloadResult() {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text">유튜브 음원 텍스트 추출</h1>
        <p className="text-sm text-dim mt-1">
          자막이 있으면 자막을, 없으면 음원을 STT(Speech-to-Text)로 변환해 텍스트로 받아봅니다.
          블로거+·인플루언서 플랜 전용.
        </p>
      </header>

      {/* 안내 박스 */}
      <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
        <div className="font-semibold mb-1.5 flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          이용 안내
        </div>
        <ul className="space-y-1 list-disc list-inside text-amber-900/90 text-[13px]">
          <li>자막이 있는 영상은 즉시 처리됩니다. 자막이 없으면 CLOVA Speech로 음원을 변환합니다.</li>
          <li>STT 변환은 영상 길이에 따라 1~2분 이상 걸릴 수 있습니다.</li>
          <li>너무 긴 영상(60분 초과)은 처리에 실패할 수 있습니다.</li>
          <li>추출된 텍스트의 저작권은 원작자에게 있습니다. 인용 시 출처를 표기해주세요.</li>
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
              if (e.key === 'Enter' && !loading && url.trim()) runExtract();
            }}
            className="flex-1 px-4 py-2 border border-border rounded-lg bg-bg text-text text-sm focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              onClick={runExtract}
              disabled={loading || !url.trim()}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? '추출 중…' : '텍스트 추출하기'}
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
            <label className="block text-xs text-dim">추출된 텍스트</label>
            {text && (
              <div className="flex items-center gap-2">
                <button
                  onClick={copyResult}
                  className="px-3 py-1 rounded-md border border-accent/40 bg-accent/5 hover:bg-accent/10 text-xs text-accent font-semibold transition-colors"
                >
                  클립보드 복사
                </button>
                <button
                  onClick={downloadResult}
                  className="px-3 py-1 rounded-md border border-border bg-white hover:bg-bg text-xs text-text font-semibold transition-colors"
                >
                  .txt 다운로드
                </button>
              </div>
            )}
          </div>

          <div className="w-full min-h-[480px] p-4 sm:p-6 border border-border rounded-lg bg-bg overflow-auto">
            {!text && !loading && (
              <div className="h-[440px] flex flex-col items-center justify-center text-dim text-sm gap-2">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                  className="opacity-30"
                >
                  <rect x="2" y="6" width="20" height="14" rx="3" />
                  <path d="m10 11 5 3-5 3z" fill="currentColor" />
                </svg>
                <span>위에 유튜브 URL을 붙여넣고 &ldquo;텍스트 추출하기&rdquo;를 눌러주세요.</span>
              </div>
            )}
            {loading && (
              <div className="h-[440px] flex flex-col items-center justify-center text-dim text-sm gap-3">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span>{STAGE_LABELS[stage]}</span>
                <div className="w-64 h-1.5 bg-border rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: STAGE_PROGRESS[stage] }}
                  />
                </div>
              </div>
            )}
            {text && (
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
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-2 ${
                            source.source === 'caption'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {source.source === 'caption' ? '자막' : 'STT'}
                        </span>
                        {text.length.toLocaleString()}자
                        {source.durationSec ? ` · 영상 ${Math.round(source.durationSec / 60)}분` : ''}
                      </p>
                    </div>
                  </div>
                )}
                <div className="text-sm text-text leading-relaxed whitespace-pre-wrap font-sans">
                  {text}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
