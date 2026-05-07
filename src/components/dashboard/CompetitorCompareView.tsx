'use client';

import { useState } from 'react';

interface CompetitorStats {
  totalKeywords: number;
  top3Count: number;
  top10Count: number;
  avgRank: number;
}

interface CompetitorKeywordRank {
  keyword: string;
  keyword_id: string;
  competitorRank: number;
}

interface CompetitorInfoViewProps {
  competitorName: string;
  competitorStats: CompetitorStats;
  competitorSubscribers: number;
  keywords: CompetitorKeywordRank[];
}

function StatRow({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-bg/50 rounded-lg">
      <span className="text-xs text-dim">{label}</span>
      <span className="text-sm font-bold font-rank text-text">
        {value.toLocaleString()}{suffix || ''}
      </span>
    </div>
  );
}

export default function CompetitorCompareView({
  competitorName,
  competitorStats,
  competitorSubscribers,
  keywords,
}: CompetitorInfoViewProps) {
  const [showAll, setShowAll] = useState(false);
  const top3Ratio = Math.round((competitorStats.top3Count / (competitorStats.totalKeywords || 1)) * 100);

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-w-sm mx-auto">
        <StatRow label="TOP 3" value={competitorStats.top3Count} suffix="개" />
        <StatRow label="TOP 3 비율" value={top3Ratio} suffix="%" />
        <StatRow label="키워드" value={competitorStats.totalKeywords} suffix="개" />
        <StatRow label="팬수" value={competitorSubscribers} />
      </div>

      {keywords.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-dim font-semibold mb-2">{competitorName}의 키워드별 순위</p>
          <div className="bg-bg rounded-lg border border-border/50 overflow-hidden">
            <div className="grid grid-cols-2 text-[11px] text-dim font-semibold px-4 py-2 border-b border-border/30">
              <span>키워드</span>
              <span className="text-center">순위</span>
            </div>
            <div className={`divide-y divide-border/10 ${showAll ? 'max-h-96' : 'max-h-64'} overflow-y-auto`}>
              {(showAll ? keywords : keywords.slice(0, 20)).map(k => (
                <div key={k.keyword_id} className="grid grid-cols-2 px-4 py-2.5 text-sm items-center">
                  <span className="text-sm font-medium truncate">{k.keyword}</span>
                  <span className="text-center font-black font-rank text-xs text-text">
                    {k.competitorRank}위
                  </span>
                </div>
              ))}
            </div>
            {keywords.length > 20 && (
              <button
                onClick={() => setShowAll(prev => !prev)}
                className="w-full text-center py-2 text-[11px] text-accent font-semibold border-t border-border/30 hover:bg-accent/5 transition cursor-pointer"
              >
                {showAll ? '접기' : `+${keywords.length - 20}개 더 보기`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
