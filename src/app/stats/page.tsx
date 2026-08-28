'use client';

import { useState, useEffect } from 'react';

interface StatsRow {
  category: string;
  years: number[];
  total: number;
  noChallenge: number;
}

interface StatsData {
  years: number[];
  rows: StatsRow[];
  yearTotals: number[];
  grandTotal: number;
  noChallengeTotal: number;
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // API가 500/에러 바디({error})를 주면 그걸 data로 삼아 grandTotal.toLocaleString()에서
    // 크래시하던 문제 방지 — 응답이 실제 통계 형태(rows 배열 + grandTotal 숫자)일 때만 채택하고,
    // 그 외(로드 실패)는 null로 두어 "데이터를 불러올 수 없습니다"로 분기한다(로딩/에러 구분).
    fetch('/api/stats/yearly')
      .then(r => (r.ok ? r.json() : null))
      .then((d: StatsData | null) =>
        setData(d && Array.isArray(d.rows) && typeof d.grandTotal === 'number' ? d : null),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20 text-dim text-sm">
        데이터를 불러올 수 없습니다.
      </div>
    );
  }

  // 연도 열은 선정일이 확인된 사람만 세므로, 전체와의 차이 = 선정일 미확인 인원.
  const yearSum = data.yearTotals.reduce((a, b) => a + b, 0);
  const unknownYearTotal = Math.max(0, data.grandTotal - yearSum);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="type-page-title">연도별 인플루언서 선정 현황</h1>
        <p className="text-sm text-dim">전체 {data.grandTotal.toLocaleString()}명</p>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-dim text-xs sticky left-0 bg-bg z-10">카테고리</th>
                {data.years.map(y => (
                  <th key={y} className="text-right px-3 py-3 font-semibold text-dim text-xs whitespace-nowrap">{y}</th>
                ))}
                <th className="text-right px-4 py-3 font-bold text-text text-xs">전체</th>
                <th className="text-right px-4 py-3 font-semibold text-dim text-xs whitespace-nowrap">키챌 미참여</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={row.category} className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-bg/50'}`}>
                  <td className="px-4 py-2.5 font-semibold text-text text-sm sticky left-0 bg-inherit z-10">{row.category}</td>
                  {row.years.map((v, yi) => (
                    <td key={yi} className={`text-right px-3 py-2.5 tabular-nums ${v === 0 ? 'text-dim/40' : 'text-text'}`}>
                      {v === 0 ? '-' : v.toLocaleString()}
                    </td>
                  ))}
                  <td className="text-right px-4 py-2.5 font-bold text-text tabular-nums">{row.total.toLocaleString()}</td>
                  <td className={`text-right px-4 py-2.5 tabular-nums ${row.noChallenge === 0 ? 'text-dim/40' : 'text-down font-semibold'}`}>
                    {row.noChallenge === 0 ? '-' : row.noChallenge.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-accent/5 border-t-2 border-accent/20">
                <td className="px-4 py-3 font-bold text-text sticky left-0 bg-accent/5 z-10">합계</td>
                {data.yearTotals.map((v, i) => (
                  <td key={i} className="text-right px-3 py-3 font-bold text-text tabular-nums">{v.toLocaleString()}</td>
                ))}
                <td className="text-right px-4 py-3 font-extrabold text-accent tabular-nums">{data.grandTotal.toLocaleString()}</td>
                <td className="text-right px-4 py-3 font-bold text-down tabular-nums">{data.noChallengeTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* '전체' 열은 모든 인플루언서를 세지만 연도 열은 선정일(naver_created_at)이 확인된 사람만 센다.
          즉 선정일 미확인이 생기면 연도 합계와 전체가 어긋나는데, 그동안 표에는 아무 설명이 없어
          사용자 눈엔 그냥 "숫자가 안 맞는 표"로 보였다. 어긋난 만큼을 명시한다.
          (기존 안내문의 "선정일 미확인 포함"은 연도 열에도 포함된다는 뜻으로 읽혀 사실과 반대였다.) */}
      {unknownYearTotal > 0 && (
        <p className="text-xs text-down text-center">
          이 중 <b>{unknownYearTotal.toLocaleString()}명</b>은 선정일을 아직 확인하지 못해 연도 열에는 집계되지 않았습니다.
          (연도 합계 {yearSum.toLocaleString()}명 + 미확인 {unknownYearTotal.toLocaleString()}명 = 전체 {data.grandTotal.toLocaleString()}명)
        </p>
      )}

      <p className="text-xs text-dim text-center">
        네이버 인플루언서 선정일 기준 연도별 집계 / 연도 열은 <b>선정일이 확인된 사람만</b> 집계 (전체 열은 전원) / 키챌 미참여 = 키워드챌린지 참여 기록 없음
      </p>
    </div>
  );
}
