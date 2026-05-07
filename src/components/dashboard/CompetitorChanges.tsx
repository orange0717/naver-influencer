'use client';

import { useState, useEffect } from 'react';

export interface CompetitorChangeEvent {
  keyword: string;
  keyword_id: string;
  changeType: 'entered' | 'exited' | 'overtook_me' | 'i_overtook';
  competitorRank: number | null;
  myRank: number | null;
  date: string;
}

interface CompetitorChangesProps {
  competitorNaverId: string;
  competitorName: string;
}

const changeConfig = {
  entered: { label: '진입', color: 'text-down', bg: 'bg-down/10', icon: '>' },
  exited: { label: '이탈', color: 'text-up', bg: 'bg-up/10', icon: '<' },
};

export default function CompetitorChanges({ competitorNaverId, competitorName }: CompetitorChangesProps) {
  const [changes, setChanges] = useState<CompetitorChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChanges() {
      try {
        const res = await fetch(
          `/api/competitors/changes?naverId=${encodeURIComponent(competitorNaverId)}`
        );
        if (res.ok) {
          const data = await res.json();
          const filtered = (data.changes || []).filter(
            (c: CompetitorChangeEvent) => c.changeType === 'entered' || c.changeType === 'exited'
          );
          setChanges(filtered);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchChanges();
  }, [competitorNaverId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-border/20 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="text-center py-8 text-dim text-xs">
        최근 7일간 키워드 진입·이탈 활동이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-dim font-semibold mb-2">최근 7일 활동</p>
      {changes.slice(0, 10).map((event, i) => {
        const config = changeConfig[event.changeType as 'entered' | 'exited'];
        return (
          <div key={`${event.keyword_id}-${event.date}-${i}`} className={`flex items-center gap-3 p-2.5 rounded-lg ${config.bg}`}>
            <div className={`w-6 h-6 rounded-full ${config.bg} flex items-center justify-center text-xs font-bold ${config.color}`}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs">
                <span className="font-semibold">{competitorName}</span>
                <span className="text-dim">이(가) </span>
                <span className="font-bold">{event.keyword}</span>
                <span className="text-dim">에서 </span>
                <span className={`font-bold ${config.color}`}>{config.label}</span>
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-dim">
                <span>{event.date.slice(5)}</span>
                {event.competitorRank && <span>{event.competitorRank}위</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
