'use client';
import { useState, useRef } from 'react';

interface KeywordResult {
  keyword: string;
  monthlyPc: number | string;
  monthlyMobile: number | string;
  monthlyTotal: number | string;
  competition: string;
  found: boolean;
}

const COMP_COLOR: Record<string, string> = {
  '낮음': 'text-up',
  '중간': 'text-warning',
  '높음': 'text-down',
  '-': 'text-dim',
};

export default function BulkSearchVolumePage() {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-extrabold">대량 키워드 조회</h1>
        <p className="text-xs text-dim">여러 키워드의 검색량을 한번에 분석합니다</p>
      </div>

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
            className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none font-mono"
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
            네이버 검색광고 API 기준 · 비회원 일 50회 한도
          </p>
        </div>

        {/* 우측: 결과 요약 또는 안내 */}
        <div className="flex flex-col justify-center">
          {!done && !loading && (
            <div className="text-center py-10 bg-surface border border-border rounded-2xl h-full flex flex-col items-center justify-center gap-3">
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
            <div className="flex items-center justify-center py-10 bg-surface border border-border rounded-2xl h-full">
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
            <div className="bg-surface border border-border rounded-2xl p-5 h-full flex flex-col justify-center gap-4">
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
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs w-8">#</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">키워드</th>
                  <th
                    className="text-right py-2.5 px-4 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors"
                    onClick={() => handleSort('monthlyTotal')}
                  >
                    월간 검색량{sortArrow('monthlyTotal')}
                  </th>
                  <th
                    className="text-right py-2.5 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors"
                    onClick={() => handleSort('monthlyPc')}
                  >
                    PC{sortArrow('monthlyPc')}
                  </th>
                  <th
                    className="text-right py-2.5 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors"
                    onClick={() => handleSort('monthlyMobile')}
                  >
                    모바일{sortArrow('monthlyMobile')}
                  </th>
                  <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs">경쟁도</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((kw, i) => (
                  <tr
                    key={kw.keyword + i}
                    className={`border-b border-border/50 hover:bg-surface-hover transition-colors ${!kw.found ? 'opacity-50' : ''}`}
                  >
                    <td className="py-2.5 px-4 font-bold text-dim font-rank text-sm">{i + 1}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-[15px] font-bold">{kw.keyword}</span>
                      {!kw.found && <span className="ml-2 text-[11px] text-dim bg-border/50 px-1.5 py-0.5 rounded">데이터 없음</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold font-rank text-sm">
                      {kw.found ? fmt(kw.monthlyTotal) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-rank text-sm">
                      {kw.found ? fmt(kw.monthlyPc) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-rank text-sm">
                      {kw.found ? fmt(kw.monthlyMobile) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs font-bold ${COMP_COLOR[kw.competition] || 'text-dim'}`}>
                        {kw.found ? kw.competition : '-'}
                      </span>
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
                className={`bg-surface rounded-xl border border-border p-4 ${!kw.found ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-bold text-dim font-rank shrink-0">#{i + 1}</span>
                    <span className="font-bold text-[15px] truncate">{kw.keyword}</span>
                  </div>
                  {kw.found && (
                    <span className={`text-xs font-bold shrink-0 ${COMP_COLOR[kw.competition]}`}>
                      {kw.competition}
                    </span>
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
    </div>
  );
}
