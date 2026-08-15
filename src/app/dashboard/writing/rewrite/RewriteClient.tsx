'use client';

import { useState, useRef } from 'react';

type Style = 'natural' | 'formal' | 'concise';

const STYLES: { id: Style; label: string; desc: string; icon: string }[] = [
  { id: 'natural', label: '자연스럽게', desc: '친근한 구어체, 읽기 편한 문장', icon: '💬' },
  { id: 'formal', label: '격식체로', desc: '전문적·공식 문서 어조', icon: '📄' },
  { id: 'concise', label: '간결하게', desc: '핵심만, 불필요한 표현 제거', icon: '✂️' },
];

const MAX_LEN = 3_000;

export default function RewriteClient() {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<Style>('natural');
  const [result, setResult] = useState<string | null>(null);
  const [correctionNotes, setCorrectionNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = text.length;
  const overLimit = charCount > MAX_LEN;

  const handleRewrite = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setError('리라이팅할 글을 입력해주세요.'); return; }
    if (overLimit) { setError(`최대 ${MAX_LEN.toLocaleString()}자까지 가능합니다.`); return; }

    setLoading(true);
    setError(null);
    setResult(null);
    setCorrectionNotes([]);

    try {
      const res = await fetch('/api/writing/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, style }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '처리 중 오류가 발생했습니다.');
      } else {
        setResult(data.result || '');
        setCorrectionNotes(data.correctionNotes || []);
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
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    setText('');
    setResult(null);
    setCorrectionNotes([]);
    setError(null);
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h1 className="type-page-title">리라이팅</h1>
        <p className="text-xs text-dim mt-0.5">교정 · 교열 · 윤문 후 다른 표현으로 새롭게 재작성합니다</p>
      </div>

      {/* 스타일 선택 */}
      <div className="flex gap-2 flex-wrap">
        {STYLES.map(s => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
              style === s.id
                ? 'bg-accent text-white border-accent'
                : 'bg-surface border-border text-text hover:border-accent hover:text-accent'
            }`}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
        <span className="self-center text-xs text-dim">
          {STYLES.find(s => s.id === style)?.desc}
        </span>
      </div>

      {/* 입력 / 결과 — 2단 그리드 */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* 입력 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">원문</label>
            <span className={`text-xs font-rank font-bold ${overLimit ? 'text-down' : 'text-dim'}`}>
              {charCount.toLocaleString()}/{MAX_LEN.toLocaleString()}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="교정·교열·리라이팅할 글을 붙여넣으세요."
            rows={14}
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRewrite}
              disabled={loading || !text.trim() || overLimit}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  리라이팅 중...
                </span>
              ) : (
                '리라이팅 시작'
              )}
            </button>
            {text && (
              <button
                onClick={handleClear}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface border border-border hover:border-accent text-dim hover:text-accent transition-colors cursor-pointer disabled:opacity-40"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* 결과 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">리라이팅 결과</label>
            {result && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    복사됨
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    복사
                  </>
                )}
              </button>
            )}
          </div>

          <div
            className={`min-h-[14rem] px-4 py-3 bg-surface border rounded-xl text-sm leading-relaxed transition-colors ${
              error ? 'border-down/40 bg-down/5' : 'border-border'
            }`}
            style={{ minHeight: '14rem' }}
          >
            {loading && (
              <div className="flex items-center justify-center h-full py-10">
                <div className="text-center">
                  <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-dim">교정 · 교열 · 리라이팅 처리 중...</p>
                </div>
              </div>
            )}

            {!loading && error && (
              <p className="text-sm text-down font-semibold">{error}</p>
            )}

            {!loading && !error && result && (
              <p className="text-text whitespace-pre-wrap">{result}</p>
            )}

            {!loading && !error && !result && (
              <p className="text-dim text-xs leading-relaxed pt-2">
                원문을 입력하고 스타일을 선택한 뒤<br />
                <span className="font-semibold">리라이팅 시작</span>을 누르면<br />
                교정·교열 후 새로운 표현으로 재작성된 글이 여기에 표시됩니다.
              </p>
            )}
          </div>

          {/* 교정 내역 */}
          {!loading && correctionNotes.length > 0 && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-bold text-accent">교정·교열 내역</p>
              <ul className="space-y-1">
                {correctionNotes.map((note, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-dim">
                    <span className="shrink-0 text-accent mt-0.5">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!loading && result && correctionNotes.length === 0 && (
            <p className="text-xs text-dim text-center">교정·교열 사항 없음 — 표현만 새롭게 재작성했습니다</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-dim/70 text-center">
        Claude AI 기반 · 최대 3,000자 · 인플루언서 플랜 이상
      </p>
    </div>
  );
}
