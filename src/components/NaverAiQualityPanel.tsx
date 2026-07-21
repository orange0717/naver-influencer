import type { NaverAiQualityEvaluation, QualityCategoryKey } from '@/lib/naver-ai-quality-evaluator';
import { QUALITY_CATEGORY_DEFS } from '@/lib/naver-ai-quality-evaluator';

function scoreColor(ratio: number): string {
  if (ratio >= 0.8) return 'text-up';
  if (ratio >= 0.5) return 'text-accent';
  return 'text-down';
}

function exposureColor(level: string): string {
  if (level === '매우 높음' || level === '높음') return 'text-up bg-up/10';
  if (level === '보통') return 'text-accent bg-accent/10';
  return 'text-down bg-down/10';
}

const CATEGORY_LABEL_MAP: Record<QualityCategoryKey, string> = Object.fromEntries(
  QUALITY_CATEGORY_DEFS.map(c => [c.key, c.label]),
) as Record<QualityCategoryKey, string>;

const CATEGORY_MAX_MAP: Record<QualityCategoryKey, number> = Object.fromEntries(
  QUALITY_CATEGORY_DEFS.map(c => [c.key, c.max]),
) as Record<QualityCategoryKey, number>;

export default function NaverAiQualityPanel({ result }: { result: NaverAiQualityEvaluation }) {
  const stars = Math.max(0, Math.min(5, Math.round(result.starRating)));

  return (
    <div className="space-y-5 pt-2 border-t border-border/30">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h4 className="text-xs font-bold text-accent mb-1">네이버 AI 검색 품질평가 (Claude Sonnet)</h4>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
            </span>
            <span className="text-xl font-black font-rank">{result.totalScore}점</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-border/20 text-dim">
            AI 검색 적합도 <b className="text-text">{result.aiSearchFitPercent}%</b>
          </span>
          <span className={`px-2.5 py-1 rounded-lg font-bold ${exposureColor(result.naverExposureLikelihood)}`}>
            노출 가능성: {result.naverExposureLikelihood}
          </span>
        </div>
      </div>

      {/* 항목별 점수 */}
      <div>
        <p className="text-xs text-dim font-semibold mb-2">항목별 점수</p>
        <div className="space-y-2">
          {result.categories.map(cat => {
            const max = CATEGORY_MAX_MAP[cat.key] ?? 0;
            const ratio = max > 0 ? cat.score / max : 0;
            return (
              <div key={cat.key} className="bg-bg rounded-xl p-3 border border-border/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold">{CATEGORY_LABEL_MAP[cat.key] ?? cat.key}</span>
                  <span className={`text-sm font-black font-rank ${scoreColor(ratio)}`}>{cat.score}/{max}</span>
                </div>
                <div className="grid gap-1 text-xs leading-relaxed">
                  <p><span className="text-dim font-semibold">좋은점 </span>{cat.good}</p>
                  <p><span className="text-dim font-semibold">부족한점 </span>{cat.bad}</p>
                  <p><span className="text-dim font-semibold">개선방법 </span>{cat.improvement}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 좋았던 점 / 부족했던 점 */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-up font-semibold mb-1.5">좋았던 점</p>
          <ul className="space-y-1 text-xs list-disc pl-4">
            {result.goodPoints.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs text-down font-semibold mb-1.5">부족했던 점</p>
          <ul className="space-y-1 text-xs list-disc pl-4">
            {result.badPoints.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      </div>

      {/* TOP5 개선 우선순위 */}
      <div>
        <p className="text-xs text-dim font-semibold mb-1.5">수정하면 가장 점수가 많이 오르는 부분 TOP5</p>
        <ol className="space-y-1 text-xs list-decimal pl-4">
          {result.top5Improvements.map((p, i) => <li key={i}>{p}</li>)}
        </ol>
      </div>

      {/* 추가하면 좋은 내용 */}
      {result.suggestedAdditions.length > 0 && (
        <div>
          <p className="text-xs text-dim font-semibold mb-1.5">추가하면 좋은 내용</p>
          <ul className="space-y-1 text-xs list-disc pl-4">
            {result.suggestedAdditions.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {/* AI 작성 흔적 */}
      <div>
        <p className="text-xs text-dim font-semibold mb-1.5">AI 작성 흔적 분석</p>
        <div className="flex flex-wrap gap-1.5">
          {result.aiTraces.map((t, i) => (
            <span key={i} className={`text-[11px] px-2 py-1 rounded-lg border ${
              t.checked ? 'bg-down/10 text-down border-down/20 font-bold' : 'bg-border/10 text-dim border-border/30'
            }`}>
              {t.checked ? '☑' : '☐'} {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* SEO 분석 */}
      <div>
        <p className="text-xs text-dim font-semibold mb-1.5">SEO 분석 (100점 기준)</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {result.seo.map((s, i) => (
            <div key={i} className="bg-bg rounded-lg p-2 text-center border border-border/30">
              <p className="text-[10px] text-dim">{s.label}</p>
              <p className={`text-sm font-bold ${scoreColor(s.score / 100)}`}>{s.score}</p>
            </div>
          ))}
        </div>
      </div>

      {/* GEO / AEO 분석 */}
      <div>
        <p className="text-xs text-dim font-semibold mb-1.5">GEO / AEO 분석 — AI 검색엔진별 인용 가능성 (100점 기준)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {result.geoAeo.map((g, i) => (
            <div key={i} className="bg-bg rounded-lg p-2 text-center border border-border/30">
              <p className="text-[10px] text-dim">{g.engine}</p>
              <p className={`text-sm font-bold ${scoreColor(g.score / 100)}`}>{g.score}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 최종 결론 */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-accent">최종 결론</span>
          <span className="text-lg font-black font-rank">{result.conclusion.score}점</span>
        </div>
        <p className="text-xs leading-relaxed">{result.conclusion.reason}</p>
        <div>
          <p className="text-xs font-semibold text-dim mb-1">가장 먼저 수정해야 할 3가지</p>
          <ol className="space-y-1 text-xs list-decimal pl-4">
            {result.conclusion.topFixes.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
