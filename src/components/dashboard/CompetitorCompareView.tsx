'use client';

import { useState } from 'react';

interface CompetitorStats {
  totalKeywords: number;
  top3Count: number;
  top10Count: number;
  avgRank: number;
}

interface SharedKeyword {
  keyword: string;
  keyword_id: string;
  myRank: number | null;
  competitorRank: number;
}

interface CompetitorCompareViewProps {
  myName: string;
  competitorName: string;
  myStats: { avgRank: number; totalKeywords: number; top3Count: number };
  competitorStats: CompetitorStats;
  mySubscribers: number;
  competitorSubscribers: number;
  sharedKeywords: SharedKeyword[];
}

function CompareBar({ label, myValue, theirValue, unit, lowerIsBetter = false }: {
  label: string;
  myValue: number;
  theirValue: number;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  const iWin = lowerIsBetter ? myValue < theirValue : myValue > theirValue;
  const tie = myValue === theirValue;

  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className={`font-bold font-rank ${iWin && !tie ? 'text-pink-500' : 'text-dim'}`}>
        {lowerIsBetter ? myValue.toFixed(1) : myValue.toLocaleString()}{unit}
      </span>
      <span className="text-dim font-semibold">{label}</span>
      <span className={`font-bold font-rank ${!iWin && !tie ? 'text-pink-500' : 'text-dim'}`}>
        {lowerIsBetter ? theirValue.toFixed(1) : theirValue.toLocaleString()}{unit}
      </span>
    </div>
  );
}

export default function CompetitorCompareView({
  myName,
  competitorName,
  myStats,
  competitorStats,
  mySubscribers,
  competitorSubscribers,
  sharedKeywords,
}: CompetitorCompareViewProps) {
  const [showAll, setShowAll] = useState(false);
  const winning = sharedKeywords.filter(sk => sk.myRank !== null && sk.myRank < sk.competitorRank).length;
  const losing = sharedKeywords.filter(sk => sk.myRank !== null && sk.myRank > sk.competitorRank).length;
  const tie = sharedKeywords.filter(sk => sk.myRank !== null && sk.myRank === sk.competitorRank).length;

  return (
    <div className="space-y-4">
      {/* 승패 요약 */}
      {sharedKeywords.length > 0 && (
        <div className="text-center py-2">
          <p className="text-sm">
            겹치는 {sharedKeywords.length}개 키워드 중{' '}
            {winning > 0 && <span className="font-bold text-up">{winning}개 앞서고</span>}
            {winning > 0 && losing > 0 && ', '}
            {losing > 0 && <span className="font-bold text-down">{losing}개 뒤지고</span>}
            {tie > 0 && <span className="text-dim">, {tie}개 동률</span>}
          </p>
        </div>
      )}

      {/* 비교 바 */}
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-dim font-semibold">
          <span>{myName}</span>
          <span>{competitorName}</span>
        </div>
        <CompareBar label="TOP 3" myValue={myStats.top3Count} theirValue={competitorStats.top3Count} unit="개" />
        <CompareBar label="TOP3 비율" myValue={Math.round((myStats.top3Count / (myStats.totalKeywords || 1)) * 100)} theirValue={Math.round((competitorStats.top3Count / (competitorStats.totalKeywords || 1)) * 100)} unit="%" />
        <CompareBar label="키워드" myValue={myStats.totalKeywords} theirValue={competitorStats.totalKeywords} unit="개" />
        <CompareBar label="팬수" myValue={mySubscribers} theirValue={competitorSubscribers} unit="" />
      </div>

      {/* 겹치는 키워드 테이블 */}
      {sharedKeywords.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-dim font-semibold mb-2">키워드별 순위 비교</p>
          <div className="bg-bg rounded-lg border border-border/50 overflow-hidden">
            <div className="grid grid-cols-3 text-[11px] text-dim font-semibold px-4 py-2 border-b border-border/30">
              <span>키워드</span>
              <span className="text-center">나</span>
              <span className="text-center">{competitorName}</span>
            </div>
            <div className={`divide-y divide-border/10 ${showAll ? 'max-h-96' : 'max-h-64'} overflow-y-auto`}>
              {(showAll ? sharedKeywords : sharedKeywords.slice(0, 20)).map(sk => {
                const iWin = sk.myRank !== null && sk.myRank < sk.competitorRank;
                const iLose = sk.myRank !== null && sk.myRank > sk.competitorRank;
                return (
                  <div key={sk.keyword_id} className="grid grid-cols-3 px-4 py-2.5 text-sm items-center">
                    <span className="text-sm font-medium truncate">{sk.keyword}</span>
                    <span className={`text-center font-black font-rank text-xs ${iWin ? 'text-up' : iLose ? 'text-down' : ''}`}>
                      {sk.myRank ?? '-'}위
                    </span>
                    <span className={`text-center font-black font-rank text-xs ${iLose ? 'text-up' : iWin ? 'text-down' : ''}`}>
                      {sk.competitorRank}위
                    </span>
                  </div>
                );
              })}
            </div>
            {sharedKeywords.length > 20 && (
              <button
                onClick={() => setShowAll(prev => !prev)}
                className="w-full text-center py-2 text-[11px] text-accent font-semibold border-t border-border/30 hover:bg-accent/5 transition cursor-pointer"
              >
                {showAll ? '접기' : `+${sharedKeywords.length - 20}개 더 보기`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
