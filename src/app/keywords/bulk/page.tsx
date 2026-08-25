'use client';

import StatusBadge from '@/components/analytics/StatusBadge';
import { ANALYTICS_SCOPE } from '@/components/analytics/tokens';
import type { StatusTone } from '@/components/analytics/types';
import '@/components/analytics/analytics-tokens.css';
import { useState, useRef } from 'react';

interface KeywordResult {
  keyword: string;
  monthlyPc: number | string;
  monthlyMobile: number | string;
  monthlyTotal: number | string;
  competition: string;
  found: boolean;
}

// 경쟁도는 분석 화면 공용 상태 토큰(초록/주황/빨강) pill 로 통일한다.
// (네이버 검색광고 API 는 '중간', 챌린지 데이터는 '보통' 을 쓴다 — 둘 다 받는다)
const COMP_TONE: Record<string, StatusTone> = {
  '낮음': 'success',
  '중간': 'warning',
  '보통': 'warning',
  '높음': 'danger',
};

function CompetitionCell({ level, found = true }: { level: string; found?: boolean }) {
  if (!found || !level || level === '-') {
    return <span className="text-dim" title="경쟁도 데이터 없음">—</span>;
  }
  return <StatusBadge tone={COMP_TONE[level] ?? 'neutral'} label={level} />;
}

type Mode = 'volume' | 'related';
type RelatedSort = 'order' | 'volume' | 'alpha';
const RELATED_LIMITS = [100, 300, 500, 1000] as const;

export default function BulkSearchVolumePage() {
  const [mode, setMode] = useState<Mode>('volume');

  // ── 모드 1: 키워드 검색량 조회 (기존 기능, 변경 없음) ──────────────
  const [input, setInput] = useState('');
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sortKey, setSortKey] = useState<'monthlyTotal' | 'monthlyPc' | 'monthlyMobile' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const keywords = input
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const handleSearch = async () => {
    if (keywords.length === 0) return;
    setLoading(true);
    setError(null);
    setDone(false);
    setResults([]);
    setSortKey(null);

    try {
      const res = await fetch('/api/bulk-search-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '조회에 실패했습니다.');
      } else {
        setResults(data.results || []);
        setDone(true);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      if (sortOrder === 'desc') setSortOrder('asc');
      else { setSortKey(null); }
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const sortArrow = (key: string) =>
    sortKey !== key ? ' ↕' : sortOrder === 'desc' ? ' ↓' : ' ↑';

  const toNum = (v: number | string) => (typeof v === 'number' ? v : 0);

  const sorted = sortKey
    ? [...results].sort((a, b) => {
        const diff = toNum(a[sortKey]) - toNum(b[sortKey]);
        return sortOrder === 'asc' ? diff : -diff;
      })
    : results;

  const fmt = (v: number | string) =>
    typeof v === 'string' ? v : v.toLocaleString();

  const downloadCsv = () => {
    const header = '키워드,월간 검색량,PC,모바일,경쟁도';
    const rows = results.map(r =>
      [r.keyword, r.monthlyTotal, r.monthlyPc, r.monthlyMobile, r.competition].join(','),
    );
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `키워드_검색량_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const foundCount = results.filter(r => r.found).length;
  const notFoundCount = results.filter(r => !r.found).length;

  // ── 모드 2: 연관 키워드 발굴 (신규 기능) ──────────────────────────
  const [relatedKeyword, setRelatedKeyword] = useState('');
  const [relatedLimit, setRelatedLimit] = useState<number>(1000);
  const [relatedSort, setRelatedSort] = useState<RelatedSort>('order');
  const [relatedResults, setRelatedResults] = useState<KeywordResult[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [relatedDone, setRelatedDone] = useState(false);
  const [seedKeyword, setSeedKeyword] = useState('');
  const [searchedKeyword, setSearchedKeyword] = useState('');

  const handleRelatedSearch = async () => {
    const kw = relatedKeyword.trim();
    if (!kw || relatedLoading) return;
    setRelatedLoading(true);
    setRelatedError(null);
    setRelatedDone(false);
    setRelatedResults([]);
    setSeedKeyword(kw);

    try {
      const res = await fetch('/api/related-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, limit: relatedLimit }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[related-keywords] API 오류:', data.error);
        setRelatedError(data.error || 'API 연결에 실패했습니다.');
      } else if (!data.results || data.results.length === 0) {
        setRelatedError('검색 결과가 없습니다.');
      } else {
        setRelatedResults(data.results);
        setSearchedKeyword(data.searchedKeyword || kw);
        setRelatedDone(true);
      }
    } catch (err) {
      console.error('[related-keywords] 네트워크 오류:', err);
      setRelatedError('잠시 후 다시 시도해 주세요.');
    } finally {
      setRelatedLoading(false);
    }
  };

  const relatedSorted = (() => {
    const arr = [...relatedResults];
    if (relatedSort === 'volume') {
      arr.sort((a, b) => toNum(b.monthlyTotal) - toNum(a.monthlyTotal));
    } else if (relatedSort === 'alpha') {
      arr.sort((a, b) => a.keyword.localeCompare(b.keyword, 'ko'));
    }
    return arr;
  })();

  const downloadRelatedCsv = () => {
    const header = '키워드,월간 검색량,PC,모바일,경쟁도';
    const rows = relatedSorted.map(r =>
      [r.keyword, r.monthlyTotal, r.monthlyPc, r.monthlyMobile, r.competition].join(','),
    );
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `연관키워드_${seedKeyword}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${ANALYTICS_SCOPE} space-y-4`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="type-page-title">대량 키워드 조회</h1>
        <p className="text-xs text-dim">
          {mode === 'volume' ? '여러 키워드의 검색량을 한번에 분석합니다' : '키워드 1개로 연관 키워드를 최대 1,000개까지 찾습니다'}
        </p>
      </div>

      {/* 모드 탭 */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setMode('volume')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
            mode === 'volume' ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-text'
          }`}
        >
          검색량 조회 (최대 100개)
        </button>
        <button
          onClick={() => setMode('related')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
            mode === 'related' ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-text'
          }`}
        >
          연관 키워드 발굴 (최대 1,000개)
        </button>
      </div>

      {mode === 'volume' && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {/* 입력 영역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">
                  키워드 입력
                  <span className="ml-2 font-normal text-dim text-xs">
                    (한 줄에 하나, 최대 100개)
                  </span>
                </label>
                <span className={`text-xs font-rank font-bold ${keywords.length > 100 ? 'text-down' : 'text-dim'}`}>
                  {keywords.length}/100
                </span>
              </div>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={"다이어트\n맛집\n여행\n강아지 사료\n..."}
                rows={12}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSearch}
                  disabled={loading || keywords.length === 0 || keywords.length > 100}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
                >
                  {loading ? '조회 중...' : `${keywords.length}개 키워드 조회`}
                </button>
                {input && (
                  <button
                    onClick={() => { setInput(''); setResults([]); setDone(false); setError(null); }}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface border border-border hover:border-accent text-dim hover:text-accent transition-colors cursor-pointer"
                  >
                    초기화
                  </button>
                )}
              </div>
              <p className="text-[11px] text-dim/70 leading-relaxed">
                네이버 검색광고 API 기준 데이터
              </p>
            </div>

            {/* 우측: 결과 요약 또는 안내 */}
            <div className="flex flex-col justify-center">
              {!done && !loading && (
                <div className="text-center py-10 bg-surface border border-border rounded-lg h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-text mb-1">키워드를 붙여넣으세요</p>
                    <p className="text-xs text-dim leading-relaxed">
                      엑셀·메모장에서 복사해 붙여넣으면<br />한번에 최대 100개 조회 가능합니다
                    </p>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center py-10 bg-surface border border-border rounded-lg h-full">
                  <div className="text-center">
                    <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
                    <p className="text-xs text-dim">
                      {keywords.length}개 키워드 조회 중...
                    </p>
                    <p className="text-[11px] text-dim/60 mt-1">네이버 API 순차 호출 중</p>
                  </div>
                </div>
              )}

              {done && (
                <div className="bg-surface border border-border rounded-lg p-5 h-full flex flex-col justify-center gap-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-extrabold font-rank text-accent">{results.length}</p>
                      <p className="text-xs text-dim mt-0.5">조회 완료</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-extrabold font-rank text-up">{foundCount}</p>
                      <p className="text-xs text-dim mt-0.5">데이터 있음</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-extrabold font-rank text-dim">{notFoundCount}</p>
                      <p className="text-xs text-dim mt-0.5">데이터 없음</p>
                    </div>
                  </div>
                  <button
                    onClick={downloadCsv}
                    className="w-full py-2.5 rounded-xl text-sm font-bold border border-accent text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    CSV 다운로드
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
              <p className="text-sm text-down font-semibold">{error}</p>
            </div>
          )}

          {/* 결과 테이블 */}
          {done && sorted.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  결과 <span className="text-accent font-rank">{sorted.length}</span>개
                  {notFoundCount > 0 && (
                    <span className="text-dim font-normal"> (데이터 없음 {notFoundCount}개 포함)</span>
                  )}
                </span>
                <span className="text-xs text-dim">네이버 검색광고 API 기준</span>
              </div>

              {/* Desktop 테이블 */}
              <div className="bg-surface rounded-lg border border-border overflow-x-auto hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-bg/50">
                      <th className="text-left py-3.5 px-4 font-semibold text-dim text-xs w-8">#</th>
                      <th className="text-left py-3.5 px-4 font-semibold text-dim text-xs">키워드</th>
                      <th
                        className="text-right py-3.5 px-4 font-semibold text-dim text-xs cursor-pointer hover:text-text transition-colors"
                        onClick={() => handleSort('monthlyTotal')}
                      >
                        월간 검색량{sortArrow('monthlyTotal')}
                      </th>
                      <th
                        className="text-right py-3.5 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-text transition-colors"
                        onClick={() => handleSort('monthlyPc')}
                      >
                        PC{sortArrow('monthlyPc')}
                      </th>
                      <th
                        className="text-right py-3.5 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-text transition-colors"
                        onClick={() => handleSort('monthlyMobile')}
                      >
                        모바일{sortArrow('monthlyMobile')}
                      </th>
                      <th className="text-center py-3.5 px-3 font-semibold text-dim text-xs">경쟁도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((kw, i) => (
                      <tr
                        key={kw.keyword + i}
                        className={`border-b border-border/50 hover:bg-surface-hover transition-colors ${!kw.found ? 'opacity-50' : ''}`}
                      >
                        <td className="py-3.5 px-4 font-bold text-dim font-rank tabular-nums text-sm">{i + 1}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-[15px] font-bold">{kw.keyword}</span>
                          {!kw.found && <span className="ml-2 text-[11px] text-dim bg-border/50 px-1.5 py-0.5 rounded">데이터 없음</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold font-rank tabular-nums text-sm">
                          {kw.found ? fmt(kw.monthlyTotal) : <span className="text-dim" title="검색광고 API 에 없는 키워드">—</span>}
                        </td>
                        <td className="py-3.5 px-3 text-right font-rank tabular-nums text-sm">
                          {kw.found ? fmt(kw.monthlyPc) : <span className="text-dim">—</span>}
                        </td>
                        <td className="py-3.5 px-3 text-right font-rank tabular-nums text-sm">
                          {kw.found ? fmt(kw.monthlyMobile) : <span className="text-dim">—</span>}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <CompetitionCell level={kw.competition} found={kw.found} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile 카드 */}
              <div className="md:hidden space-y-2">
                {sorted.map((kw, i) => (
                  <div
                    key={kw.keyword + i}
                    className={`bg-surface rounded-lg border border-border p-4 ${!kw.found ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-bold text-dim font-rank shrink-0">#{i + 1}</span>
                        <span className="font-bold text-[15px] truncate">{kw.keyword}</span>
                      </div>
                      {kw.found && (
                        <span className="shrink-0"><CompetitionCell level={kw.competition} /></span>
                      )}
                    </div>
                    {kw.found ? (
                      <div className="flex items-center gap-3 text-sm text-dim">
                        <span>월 <span className="text-text font-bold font-rank">{fmt(kw.monthlyTotal)}</span>회</span>
                        <span>PC {fmt(kw.monthlyPc)}</span>
                        <span>모바일 {fmt(kw.monthlyMobile)}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-dim">검색 데이터 없음</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'related' && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {/* 입력 영역 */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold">키워드 입력</label>
                <div className="flex gap-2 mt-2">
                  <input
                    value={relatedKeyword}
                    onChange={e => setRelatedKeyword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRelatedSearch(); }}
                    placeholder="예) 천안 맛집"
                    className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
                  />
                  <button
                    onClick={handleRelatedSearch}
                    disabled={relatedLoading || !relatedKeyword.trim()}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
                  >
                    {relatedLoading ? '검색 중...' : '검색'}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-dim">최대 결과 수</span>
                <div className="flex gap-1.5 mt-1.5">
                  {RELATED_LIMITS.map(n => (
                    <button
                      key={n}
                      onClick={() => setRelatedLimit(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        relatedLimit === n
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface border-border text-dim hover:border-accent hover:text-accent'
                      }`}
                    >
                      {n.toLocaleString()}개
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-dim">정렬 순서</span>
                <div className="flex gap-1.5 mt-1.5">
                  {([
                    ['order', '관련도순'],
                    ['volume', '검색량순'],
                    ['alpha', '가나다순'],
                  ] as [RelatedSort, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setRelatedSort(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        relatedSort === key
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface border-border text-dim hover:border-accent hover:text-accent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-dim/70 leading-relaxed">
                네이버 검색광고 API 기준 · 입력 키워드의 연관 검색어를 함께 조회합니다
              </p>
            </div>

            {/* 우측: 결과 요약 또는 안내 */}
            <div className="flex flex-col justify-center">
              {!relatedDone && !relatedLoading && (
                <div className="text-center py-10 bg-surface border border-border rounded-lg h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-text mb-1">키워드 1개를 입력하세요</p>
                    <p className="text-xs text-dim leading-relaxed">
                      예) 천안 맛집 → 천안 맛집 추천, 천안 맛집 베스트...<br />연관 키워드를 최대 1,000개까지 찾아드립니다
                    </p>
                  </div>
                </div>
              )}

              {relatedLoading && (
                <div className="flex items-center justify-center py-10 bg-surface border border-border rounded-lg h-full">
                  <div className="text-center">
                    <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
                    <p className="text-xs text-dim">&ldquo;{relatedKeyword}&rdquo; 연관 키워드 조회 중...</p>
                    <p className="text-[11px] text-dim/60 mt-1">네이버 API 호출 중</p>
                  </div>
                </div>
              )}

              {relatedDone && (
                <div className="bg-surface border border-border rounded-lg p-5 h-full flex flex-col justify-center gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-extrabold font-rank text-accent">{relatedResults.length}</p>
                    <p className="text-xs text-dim mt-0.5">&ldquo;{seedKeyword}&rdquo; 연관 키워드 발견</p>
                  </div>
                  <button
                    onClick={downloadRelatedCsv}
                    className="w-full py-2.5 rounded-xl text-sm font-bold border border-accent text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    CSV 다운로드
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 에러 */}
          {relatedError && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
              <p className="text-sm text-down font-semibold">{relatedError}</p>
            </div>
          )}

          {/* 결과 테이블 */}
          {relatedDone && relatedSorted.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  결과 <span className="text-accent font-rank">{relatedSorted.length}</span>개
                </span>
                <span className="text-xs text-dim">네이버 검색광고 API 기준</span>
              </div>
              {searchedKeyword && searchedKeyword !== seedKeyword && (
                <p className="text-[11px] text-dim/70">
                  네이버 검색광고 API는 띄어쓰기 없는 키워드만 지원해 &ldquo;{searchedKeyword}&rdquo;로 조회했습니다.
                </p>
              )}

              {/* Desktop 테이블 */}
              <div className="bg-surface rounded-lg border border-border overflow-x-auto hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-bg/50">
                      <th className="text-left py-3.5 px-4 font-semibold text-dim text-xs w-8">#</th>
                      <th className="text-left py-3.5 px-4 font-semibold text-dim text-xs">키워드</th>
                      <th className="text-right py-3.5 px-4 font-semibold text-dim text-xs">월간 검색량</th>
                      <th className="text-right py-3.5 px-3 font-semibold text-dim text-xs">PC</th>
                      <th className="text-right py-3.5 px-3 font-semibold text-dim text-xs">모바일</th>
                      <th className="text-center py-3.5 px-3 font-semibold text-dim text-xs">경쟁도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedSorted.map((kw, i) => (
                      <tr
                        key={kw.keyword + i}
                        className="border-b border-border/50 hover:bg-surface-hover transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold text-dim font-rank tabular-nums text-sm">{i + 1}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-[15px] font-bold">{kw.keyword}</span>
                          {kw.keyword === seedKeyword && (
                            <span className="ml-2 text-[11px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">시드</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold font-rank tabular-nums text-sm">{fmt(kw.monthlyTotal)}</td>
                        <td className="py-3.5 px-3 text-right font-rank tabular-nums text-sm">{fmt(kw.monthlyPc)}</td>
                        <td className="py-3.5 px-3 text-right font-rank tabular-nums text-sm">{fmt(kw.monthlyMobile)}</td>
                        <td className="py-3.5 px-3 text-center">
                          <CompetitionCell level={kw.competition} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile 카드 */}
              <div className="md:hidden space-y-2">
                {relatedSorted.map((kw, i) => (
                  <div key={kw.keyword + i} className="bg-surface rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-bold text-dim font-rank shrink-0">#{i + 1}</span>
                        <span className="font-bold text-[15px] truncate">{kw.keyword}</span>
                      </div>
                      <span className="shrink-0"><CompetitionCell level={kw.competition} /></span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-dim">
                      <span>월 <span className="text-text font-bold font-rank">{fmt(kw.monthlyTotal)}</span>회</span>
                      <span>PC {fmt(kw.monthlyPc)}</span>
                      <span>모바일 {fmt(kw.monthlyMobile)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
