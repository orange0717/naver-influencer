'use client';

import { useEffect, useState } from 'react';
import type { BlogPost, RankingResult, RankDelta, KeywordMeta } from './KeywordRankingSection.helpers';
import { timeAgo, renderRankTab, computeDeltaDisplay } from './KeywordRankingSection.helpers';

interface HistoryPoint { rank: number | null; checkedAt: string }
interface HistorySeries { integrated: HistoryPoint[]; blog: HistoryPoint[]; influencer: HistoryPoint[] }

interface Props {
  blogId: string;
  post: BlogPost;
  keyword: string;
  result?: RankingResult;
  delta?: RankDelta;
  meta?: KeywordMeta;
  onClose: () => void;
}

/**
 * 키워드 상세 드로어 (스펙 #27): 키워드·변형·통합검색·블로그탭·검색량·전일·7일전·최근확인 + 순위 변화 그래프.
 * 그래프는 keyword_rank_history 시계열(/api/my/keyword-ranking/history)을 통합검색 기준 스파크라인으로 표시.
 */
export default function KeywordDetailDrawer({ blogId, post, keyword, result, delta, meta, onClose }: Props) {
  const [series, setSeries] = useState<HistorySeries | null>(null);
  const [loading, setLoading] = useState(true);
  // AI 브리핑/탭 노출(스펙 #16) — 저장된 결과만 읽는다(라이브 확인·AI 호출 없음, 스펙 #20).
  const [cite, setCite] = useState<{ exposed: boolean | null; tabExposed: boolean | null; checkedAt: string | null } | null | undefined>(undefined);

  useEffect(() => {
    // 드로어는 상세 키워드마다 key로 새로 마운트되므로 loading 초기값(true)이 곧 이 요청의 로딩 상태다.
    let cancelled = false;
    fetch(`/api/my/keyword-ranking/history?blogId=${encodeURIComponent(blogId)}&postId=${encodeURIComponent(post.id)}&keyword=${encodeURIComponent(keyword)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled) setSeries(data?.series ?? { integrated: [], blog: [], influencer: [] }); })
      .catch(() => { if (!cancelled) setSeries({ integrated: [], blog: [], influencer: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [blogId, post.id, keyword]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/my/ai-briefing-state?blogId=${encodeURIComponent(blogId)}&postId=${encodeURIComponent(post.id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        const results: Record<string, { exposed: boolean | null; tabExposed: boolean | null; checkedAt: string | null }> = data?.briefingResults ?? {};
        // 대표키워드 기준으로 확인되므로 keyword → baseKeyword 순으로 매칭한다.
        const hit = results[`${post.id}::${keyword}`] ?? (meta?.baseKeyword ? results[`${post.id}::${meta.baseKeyword}`] : undefined);
        setCite(hit ?? null);
      })
      .catch(() => { if (!cancelled) setCite(null); });
    return () => { cancelled = true; };
  }, [blogId, post.id, keyword, meta?.baseKeyword]);

  const prevDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null) : null;
  const weekDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-surface shadow-lg overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {meta?.keywordType && (
                <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                  {meta.keywordType === 'primary' ? '대표' : meta.keywordType === 'secondary' ? '보조' : meta.keywordType === 'variant' ? '변형' : '직접'}
                </span>
              )}
              <h3 className="font-bold text-base truncate" title={keyword}>{keyword}</h3>
            </div>
            {meta?.baseKeyword && meta.baseKeyword !== keyword && (
              <p className="text-[11px] text-dim mt-0.5">변형 원본: {meta.baseKeyword}</p>
            )}
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:underline line-clamp-1 mt-0.5" title={post.title}>{post.title}</a>
          </div>
          <button onClick={onClose} className="text-dim hover:text-text cursor-pointer text-lg shrink-0" aria-label="닫기">✕</button>
        </div>

        {/* 현재 순위 요약 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-dim mb-1">통합검색</div>
            <div>{renderRankTab(result, result?.viewTab)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-dim mb-1">블로그탭</div>
            <div>{renderRankTab(result, result?.blogTab)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-dim mb-1">인플루언서탭</div>
            <div>{renderRankTab(result, result?.influencerTab)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-dim mb-1">검색량(월)</div>
            <div className="text-sm font-bold">{result?.searchVolume ? result.searchVolume.toLocaleString() : '--'}</div>
          </div>
        </div>

        {/* AI 브리핑 / AI 탭 노출 (스펙 #16) — 저장된 확인 결과만 표시(라이브 확인 없음) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-dim mb-1">AI 브리핑 노출</div>
            <CiteBadge state={cite === undefined ? undefined : cite?.exposed ?? null} />
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-dim mb-1">AI 탭 노출</div>
            <CiteBadge state={cite === undefined ? undefined : cite?.tabExposed ?? null} />
          </div>
        </div>

        {/* 전일/7일 대비 (통합검색 기준) */}
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-dim">전일 </span>
            {prevDelta ? <span className={`font-bold ${prevDelta.colorClass}`} title={prevDelta.tooltip}>{prevDelta.label}</span> : <span className="text-dim">--</span>}
          </div>
          <div>
            <span className="text-dim">7일 전 </span>
            {weekDelta ? <span className={`font-bold ${weekDelta.colorClass}`} title={weekDelta.tooltip}>{weekDelta.label}</span> : <span className="text-dim">--</span>}
          </div>
          <div className="ml-auto text-dim">
            최근 확인 {result?.checkedAt ? timeAgo(result.checkedAt) : '--'}
          </div>
        </div>

        {/* 순위 변화 그래프 (통합검색) */}
        <div>
          <div className="text-[11px] text-dim mb-1.5">통합검색 순위 변화</div>
          {loading ? (
            <div className="h-24 rounded-lg bg-border/20 animate-pulse" />
          ) : (
            <RankSparkline points={series?.integrated ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

/** AI 브리핑/탭 노출 뱃지 — undefined=로딩, null=미확인, true=인용, false=미인용. */
function CiteBadge({ state }: { state: boolean | null | undefined }) {
  if (state === undefined) return <span className="text-sm text-dim">…</span>;
  if (state === null) return <span className="text-sm font-bold text-dim">미확인</span>;
  return state
    ? <span className="text-sm font-bold text-up">인용 ○</span>
    : <span className="text-sm font-bold text-down">미인용 ✕</span>;
}

/** 순위 스파크라인 — 순위 숫자가 낮을수록(좋을수록) 위로. 미노출(rank=null) 지점은 선을 끊는다. */
function RankSparkline({ points }: { points: HistoryPoint[] }) {
  const exposed = points.filter(p => typeof p.rank === 'number') as { rank: number; checkedAt: string }[];
  if (exposed.length < 2) {
    return <div className="h-24 rounded-lg border border-border flex items-center justify-center text-[11px] text-dim">이력이 쌓이면 순위 변화 그래프가 표시됩니다</div>;
  }
  const W = 320, H = 96, pad = 12;
  const ranks = exposed.map(p => p.rank);
  const minR = Math.min(...ranks), maxR = Math.max(...ranks);
  const span = Math.max(1, maxR - minR);
  const stepX = (W - pad * 2) / (exposed.length - 1);
  // 낮은 순위(=좋음)를 위로: y = pad + (rank - minR) / span * (H - 2pad)
  const coords = exposed.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + ((p.rank - minR) / span) * (H - pad * 2);
    return { x, y, rank: p.rank };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 rounded-lg border border-border" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--color-accent, #BF877A)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="var(--color-accent, #BF877A)" >
          <title>{`${exposed[i].rank}위 · ${new Date(exposed[i].checkedAt).toLocaleDateString('ko-KR')}`}</title>
        </circle>
      ))}
    </svg>
  );
}
