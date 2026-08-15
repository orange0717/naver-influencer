'use client';

import { useMemo, useState } from 'react';
import { CORRECTION_RULES } from '@/lib/spellcheck/rules';
import {
  applyCorrections,
  applyFixes,
  claudeResponseToMatches,
  mergeMatches,
  type Match,
} from '@/lib/spellcheck/engine';
import ErrorReportModal, { type ReportPayload } from '@/components/writing/ErrorReportModal';

const MAX_LEN = 10_000;

export default function SpellcheckClient() {
  const [text, setText] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reportPayload, setReportPayload] = useState<ReportPayload | null>(null);

  const charCount = text.length;

  async function runCheck() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('검사할 글을 입력해주세요.');
      return;
    }
    if (trimmed.length > MAX_LEN) {
      setError(`최대 ${MAX_LEN.toLocaleString()}자까지 검사할 수 있습니다.`);
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    setMatches(null);

    try {
      // 1) 로컬 정규식 규칙
      const ruleMatches = applyCorrections(trimmed, CORRECTION_RULES);

      // 2) Claude AI (stage 1 + stage 2 병렬)
      let aiMatches: Match[] = [];
      try {
        const res = await fetch('/api/writing/spellcheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          const s1 = claudeResponseToMatches(trimmed, data?.stage1?.corrections ?? [], 1);
          const s2 = claudeResponseToMatches(trimmed, data?.stage2?.corrections ?? [], 2);
          aiMatches = [...s1, ...s2];
        } else if (res.status === 429) {
          setInfo('AI 요청 한도에 도달해 규칙 기반 결과만 표시됩니다. 5분 뒤 다시 시도해주세요.');
        } else if (res.status === 402) {
          setError('구독 플랜이 필요합니다.');
          return;
        } else {
          setInfo('AI 호출에 실패해 규칙 기반 결과만 표시됩니다.');
        }
      } catch {
        setInfo('AI 호출 네트워크 오류 — 규칙 기반 결과만 표시됩니다.');
      }

      // 3) 병합 (Claude 우선)
      const merged = mergeMatches(ruleMatches, aiMatches);
      setMatches(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검사 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setText('');
    setMatches(null);
    setError(null);
    setInfo(null);
  }

  function applyAll() {
    if (!matches || matches.length === 0) return;
    const fixed = applyFixes(text, matches);
    setText(fixed);
    setMatches(null);
    setInfo('모든 수정안을 원문에 적용했습니다.');
  }

  async function copyResult() {
    const out = matches && matches.length > 0 ? applyFixes(text, matches) : text;
    try {
      await navigator.clipboard.writeText(out);
      setInfo('클립보드에 복사했습니다.');
    } catch {
      setError('클립보드 복사에 실패했습니다.');
    }
  }

  // 하이라이트 뷰 segment 계산
  const highlightSegments = useMemo(() => {
    if (!matches || matches.length === 0) return null;
    const segs: Array<{ text: string; error?: boolean; idx?: number }> = [];
    let pos = 0;
    matches.forEach((m, i) => {
      if (m.start > pos) segs.push({ text: text.substring(pos, m.start) });
      segs.push({ text: m.word, error: true, idx: i });
      pos = m.end;
    });
    if (pos < text.length) segs.push({ text: text.substring(pos) });
    return segs;
  }, [matches, text]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text">맞춤법 검사</h1>
        <p className="text-sm text-dim mt-1">
          국립국어원 기준 1,600+개 규칙 + Claude AI 하이브리드 검사. 블로거+·인플루언서 플랜 무제한 이용.
        </p>
      </header>

      <div className="bg-surface rounded-lg border border-border p-4 sm:p-6">
        {/* 툴바 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={runCheck}
            disabled={loading || !text.trim()}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '검사 중…' : '검사하기'}
          </button>
          <button
            onClick={resetAll}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-border bg-white hover:bg-bg text-sm text-text disabled:opacity-50 transition-colors"
          >
            초기화
          </button>
          <button
            onClick={applyAll}
            disabled={!matches || matches.length === 0}
            className="px-4 py-2 rounded-lg border border-accent/40 bg-accent/5 hover:bg-accent/10 text-sm text-accent font-semibold disabled:opacity-50 transition-colors"
          >
            원문에 모두 적용
          </button>
          <button
            onClick={copyResult}
            disabled={!text.trim()}
            className="px-4 py-2 rounded-lg border border-border bg-white hover:bg-bg text-sm text-text disabled:opacity-50 transition-colors"
          >
            결과 복사
          </button>
          <span className="ml-auto text-xs text-dim">
            {charCount.toLocaleString()} / {MAX_LEN.toLocaleString()}자
          </span>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 좌: 입력/하이라이트 */}
          <div>
            <label className="block text-xs text-dim mb-1">원문</label>
            {matches && highlightSegments ? (
              <div className="w-full h-[480px] p-4 border border-border rounded-lg bg-bg text-text text-sm leading-relaxed whitespace-pre-wrap overflow-auto">
                {highlightSegments.map((s, i) =>
                  s.error ? (
                    <span
                      key={i}
                      className="bg-accent/15 text-accent border-b-2 border-accent/70 rounded-sm px-0.5"
                      title={matches[s.idx!]?.reason}
                    >
                      {s.text}
                    </span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="검사할 글을 입력해주세요. (최대 10,000자)"
                maxLength={MAX_LEN}
                className="w-full h-[480px] p-4 border border-border rounded-lg bg-bg text-text text-sm leading-relaxed focus:outline-none focus:border-accent resize-none"
              />
            )}
          </div>

          {/* 우: 결과 */}
          <div>
            <label className="block text-xs text-dim mb-1">검사 결과</label>
            <div className="w-full h-[480px] p-4 border border-border rounded-lg bg-bg overflow-auto">
              {!matches && !loading && (
                <div className="h-full flex items-center justify-center text-dim text-sm">
                  좌측에 글을 입력하고 &quot;검사하기&quot;를 누르세요.
                </div>
              )}
              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-dim text-sm gap-2">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span>AI가 글을 정독 중입니다…</span>
                </div>
              )}
              {matches && matches.length === 0 && (
                <div className="h-full flex items-center justify-center text-green-700 text-sm font-semibold">
                  오류를 발견하지 못했습니다. 잘 쓰셨습니다!
                </div>
              )}
              {matches && matches.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-dim mb-3">
                    총 <span className="font-bold text-accent">{matches.length}건</span> 발견 ·{' '}
                    규칙 {matches.filter((m) => m.source === 'rule').length}건 · AI{' '}
                    {matches.filter((m) => m.source === 'claude').length}건
                  </div>
                  {matches.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white border border-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="text-red-600 line-through font-semibold">{m.word}</span>
                        <span className="text-dim">→</span>
                        <span className="text-green-700 font-bold">{m.fix}</span>
                        {m.category && (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-accent/10 text-accent border border-accent/20">
                            {m.category}
                          </span>
                        )}
                        {m.source === 'claude' && (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                            AI
                          </span>
                        )}
                      </div>
                      {m.reason && (
                        <div className="text-xs text-dim mt-1.5 pl-7">{m.reason}</div>
                      )}
                      <div className="text-right mt-1">
                        <button
                          onClick={() =>
                            setReportPayload({
                              tool: m.source === 'claude' ? 'ninfl-spellcheck-ai' : 'ninfl-spellcheck',
                              original: m.word,
                              replacement: m.fix,
                              category: m.category,
                            })
                          }
                          className="text-[11px] text-dim hover:text-accent hover:underline"
                        >
                          오류 제보
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ErrorReportModal
        open={!!reportPayload}
        payload={reportPayload}
        onClose={() => setReportPayload(null)}
      />
    </div>
  );
}
