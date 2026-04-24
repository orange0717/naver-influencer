'use client';

import { useState } from 'react';

const MAX_LEN = 12_000;
const MIN_LEN = 50;

interface FeedbackResult {
  score?: number;
  scores?: {
    functional?: number;
    structural?: number;
    language?: number;
    readability?: number;
  };
  score_comment?: string;
  headline?: string;
  strengths?: string;
  improvements?: string;
  reader_reaction?: string;
  spelling_errors?: Array<{ wrong: string; correct: string; rule?: string }>;
}

const AREAS = [
  { key: 'functional', label: 'A. 기능적 품질', desc: '목적·정확성·완전성·독창성', color: 'bg-blue-500' },
  { key: 'structural', label: 'B. 구조적 품질', desc: '명확성·일관성·간결성 (3C)', color: 'bg-green-600' },
  { key: 'language', label: 'C. 언어 품질', desc: '맞춤법·문법·이중피동', color: 'bg-accent' },
  { key: 'readability', label: 'D. 가독성', desc: '문장 길이·솔직함·구성', color: 'bg-purple-600' },
] as const;

export default function FeedbackClient() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalyze() {
    const trimmed = text.trim();
    if (trimmed.length < MIN_LEN) {
      setError(`최소 ${MIN_LEN}자 이상 입력해주세요.`);
      return;
    }
    if (trimmed.length > MAX_LEN) {
      setError(`최대 ${MAX_LEN.toLocaleString()}자까지 분석할 수 있습니다.`);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/writing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'AI 분석에 실패했습니다.');
        return;
      }
      setResult(data);
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  const charCount = text.length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text">AI 심층 피드백</h1>
        <p className="text-sm text-dim mt-1">
          Claude Opus 4.6이 4영역(기능적·구조적·언어·가독성) 품질을 평가하고 강점·개선점을 제시합니다.
          분석에는 30초~1분이 소요될 수 있습니다.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌: 입력 */}
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-text">분석할 글</label>
            <span className="text-xs text-dim">
              {charCount.toLocaleString()} / {MAX_LEN.toLocaleString()}자
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="블로그 포스팅이나 글의 초안을 붙여넣어주세요. (50자 이상, 12,000자 이하)"
            maxLength={MAX_LEN}
            className="w-full h-[440px] p-4 border border-border rounded-lg bg-bg text-text text-sm leading-relaxed focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={runAnalyze}
              disabled={loading || text.trim().length < MIN_LEN}
              className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'AI가 정독 중…' : 'AI 심층 분석'}
            </button>
            <button
              onClick={() => {
                setText('');
                setResult(null);
                setError(null);
              }}
              disabled={loading}
              className="px-4 py-2.5 rounded-lg border border-border bg-white hover:bg-bg text-sm text-text disabled:opacity-50 transition-colors"
            >
              초기화
            </button>
          </div>
          {error && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* 우: 결과 */}
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-6">
          {!result && !loading && (
            <div className="h-[520px] flex flex-col items-center justify-center text-dim text-sm gap-2">
              <div className="text-4xl">📝</div>
              <div>좌측에 글을 입력하고</div>
              <div className="font-semibold text-text">"AI 심층 분석"</div>
              <div>버튼을 누르세요.</div>
            </div>
          )}

          {loading && (
            <div className="h-[520px] flex flex-col items-center justify-center gap-3 text-dim text-sm">
              <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <div className="font-semibold text-text">AI가 글을 정독 중입니다…</div>
              <div className="text-xs">30초~1분 정도 소요됩니다.</div>
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* 총점 */}
              <div className="text-center py-2">
                <div className="text-6xl font-bold text-accent leading-none">
                  {typeof result.score === 'number' ? result.score : '--'}
                </div>
                <div className="text-xs text-dim mt-2">100점 만점</div>
                {result.score_comment && (
                  <div className="text-sm text-text mt-2">{result.score_comment}</div>
                )}
              </div>

              {/* 한줄 평가 */}
              {result.headline && (
                <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm font-semibold text-text">
                  {result.headline}
                </div>
              )}

              {/* 4영역 점수바 */}
              {result.scores && (
                <div className="space-y-3">
                  {AREAS.map((a) => {
                    const val = Number(result.scores?.[a.key] ?? 0);
                    const pct = Math.max(0, Math.min(100, (val / 25) * 100));
                    return (
                      <div key={a.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div>
                            <span className="font-semibold text-text">{a.label}</span>
                            <span className="text-dim ml-1">· {a.desc}</span>
                          </div>
                          <span className="font-bold text-text">{val}/25</span>
                        </div>
                        <div className="h-1.5 bg-bg rounded-full overflow-hidden">
                          <div
                            className={`h-full ${a.color} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 강점 / 개선점 / 독자반응 */}
              <div className="space-y-3">
                {result.strengths && (
                  <Section title="강점" color="text-green-700">
                    {result.strengths}
                  </Section>
                )}
                {result.improvements && (
                  <Section title="개선 제안" color="text-accent">
                    {result.improvements}
                  </Section>
                )}
                {result.reader_reaction && (
                  <Section title="독자 반응 예측" color="text-blue-700">
                    {result.reader_reaction}
                  </Section>
                )}
              </div>

              {/* 맞춤법 오류 */}
              {Array.isArray(result.spelling_errors) && result.spelling_errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-text mb-2">맞춤법 교정 ({result.spelling_errors.length}건)</h3>
                  <div className="space-y-1.5">
                    {result.spelling_errors.map((e, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-bg border border-border">
                        <span className="text-red-600 line-through">{e.wrong}</span>
                        <span className="mx-2 text-dim">→</span>
                        <span className="text-green-700 font-semibold">{e.correct}</span>
                        {e.rule && <div className="text-dim mt-0.5">{e.rule}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: string }) {
  return (
    <div>
      <h3 className={`text-sm font-bold mb-1.5 ${color}`}>{title}</h3>
      <div className="text-sm text-text whitespace-pre-line leading-relaxed">{children}</div>
    </div>
  );
}
