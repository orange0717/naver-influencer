'use client';

import { useState, useEffect, useCallback } from 'react';
import CompetitorCompareView from '@/components/dashboard/CompetitorCompareView';
import CompetitorChanges from '@/components/dashboard/CompetitorChanges';

interface CompetitorData {
  competitor: {
    naverId: string;
    displayName: string;
    imageUrl: string;
    category: string;
    subscriberCount: number;
  };
  stats: {
    totalKeywords: number;
    top3Count: number;
    top10Count: number;
    avgRank: number;
  };
  top5: {
    keyword: string;
    keyword_id: string;
    rank_position: number;
  }[];
  sharedKeywords: {
    keyword: string;
    keyword_id: string;
    myRank: number | null;
    competitorRank: number;
  }[];
  sharedCount: number;
}

interface MyStats {
  avgRank: number;
  totalKeywords: number;
  top3Count: number;
}

export default function CompetitorSection({ naverId, myStats, mySubscriberCount = 0, myDisplayName = '나' }: {
  naverId: string;
  myStats: MyStats;
  mySubscriberCount?: number;
  myDisplayName?: string;
}) {
  const [competitorIds, setCompetitorIds] = useState<string[]>([]);
  const [competitorData, setCompetitorData] = useState<Map<string, CompetitorData>>(new Map());
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'compare' | 'changes'>('compare');

  // 저장된 경쟁자 로드
  useEffect(() => {
    const saved = localStorage.getItem(`competitors_${naverId}`);
    if (saved) {
      try {
        const ids: string[] = JSON.parse(saved);
        setCompetitorIds(ids);
        ids.forEach(id => fetchCompetitor(id));
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naverId]);

  const saveCompetitors = useCallback((ids: string[]) => {
    localStorage.setItem(`competitors_${naverId}`, JSON.stringify(ids));
  }, [naverId]);

  const fetchCompetitor = async (competitorId: string) => {
    setLoading(competitorId);
    try {
      const res = await fetch(`/api/competitors?naverId=${encodeURIComponent(competitorId)}&myNaverId=${encodeURIComponent(naverId)}`);
      if (res.ok) {
        const data: CompetitorData = await res.json();
        setCompetitorData(prev => new Map(prev).set(competitorId, data));
      }
    } catch { /* ignore */ }
    setLoading(null);
  };

  const extractId = (input: string): string => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_]+)/);
    if (urlMatch) return urlMatch[1].toLowerCase();
    return trimmed.replace(/^@/, '').toLowerCase();
  };

  const addCompetitor = () => {
    const id = extractId(inputValue);
    if (!id || id === naverId || competitorIds.includes(id)) return;
    const updated = [...competitorIds, id];
    setCompetitorIds(updated);
    saveCompetitors(updated);
    fetchCompetitor(id);
    setInputValue('');
  };

  const removeCompetitor = (id: string) => {
    const updated = competitorIds.filter(c => c !== id);
    setCompetitorIds(updated);
    saveCompetitors(updated);
    setCompetitorData(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-bg/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">경쟁자 분석</h3>
            <p className="text-[11px] text-dim mt-0.5">경쟁 인플루언서를 등록하고 순위를 비교하세요</p>
          </div>
          <span className="text-xs text-accent font-semibold">VS</span>
        </div>
      </div>

      {/* 경쟁자 추가 */}
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
            placeholder="경쟁자 ID 또는 인플루언서 링크"
            className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
          />
          <button
            onClick={addCompetitor}
            disabled={!inputValue.trim()}
            className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0"
          >
            추가
          </button>
        </div>
      </div>

      {/* 경쟁자 목록 */}
      {competitorIds.length > 0 ? (
        <div className="divide-y divide-border/20">
          {competitorIds.map(cId => {
            const data = competitorData.get(cId);
            const isLoading = loading === cId;
            const isExpanded = expanded === cId;

            return (
              <div key={cId}>
                {/* 경쟁자 요약 */}
                <div
                  className="px-5 py-4 hover:bg-surface-hover transition cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : cId)}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-border/30 animate-pulse" />
                      <div className="flex-1">
                        <div className="w-24 h-4 bg-border/30 rounded animate-pulse" />
                        <div className="w-16 h-3 bg-border/20 rounded animate-pulse mt-1" />
                      </div>
                    </div>
                  ) : data ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {data.competitor.imageUrl ? (
                          <img src={data.competitor.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 bg-down/10 rounded-full flex items-center justify-center text-down font-bold text-sm">
                            {data.competitor.displayName[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{data.competitor.displayName}</span>
                            <span className="text-[10px] text-dim">@{cId}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-dim">{data.competitor.category}</span>
                            <span className="text-xs text-dim">·</span>
                            <span className="text-xs text-dim">겹치는 키워드 {data.sharedCount}개</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {/* 나 vs 경쟁자 비교 */}
                        <div className="hidden sm:flex items-center gap-3 text-center">
                          <div>
                            <p className="text-xs text-dim">나</p>
                            <p className={`text-sm font-black font-rank ${myStats.avgRank <= data.stats.avgRank ? 'text-up' : 'text-down'}`}>
                              {Math.round(myStats.avgRank)}위
                            </p>
                          </div>
                          <span className="text-dim text-xs">vs</span>
                          <div>
                            <p className="text-xs text-dim">경쟁자</p>
                            <p className={`text-sm font-black font-rank ${data.stats.avgRank < myStats.avgRank ? 'text-up' : 'text-down'}`}>
                              {data.stats.avgRank}위
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); removeCompetitor(cId); }}
                          className="text-dim hover:text-down transition cursor-pointer p-1"
                          title="삭제"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                        </button>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"
                          className={`text-dim transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          <path d="M3 5l4 4 4-4"/>
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-dim">@{cId} — 데이터 없음</span>
                      <button
                        onClick={e => { e.stopPropagation(); removeCompetitor(cId); }}
                        className="text-dim hover:text-down transition cursor-pointer"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* 상세 비교 (펼치기) — 탭 시스템 */}
                {isExpanded && data && (
                  <div className="px-5 pb-5 space-y-4">
                    {/* 탭 헤더 */}
                    <div className="flex bg-bg rounded-lg p-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveTab('compare'); }}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                          activeTab === 'compare' ? 'bg-surface text-text shadow-sm' : 'text-dim hover:text-text'
                        }`}
                      >
                        비교
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveTab('changes'); }}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                          activeTab === 'changes' ? 'bg-surface text-text shadow-sm' : 'text-dim hover:text-text'
                        }`}
                      >
                        변동
                      </button>
                    </div>

                    {/* 비교 탭 */}
                    {activeTab === 'compare' && (
                      <CompetitorCompareView
                        myName={myDisplayName}
                        competitorName={data.competitor.displayName}
                        myStats={myStats}
                        competitorStats={data.stats}
                        mySubscribers={mySubscriberCount}
                        competitorSubscribers={data.competitor.subscriberCount}
                        sharedKeywords={data.sharedKeywords}
                      />
                    )}

                    {/* 변동 탭 */}
                    {activeTab === 'changes' && (
                      <CompetitorChanges
                        competitorNaverId={cId}
                        competitorName={data.competitor.displayName}
                        myNaverId={naverId}
                      />
                    )}

                    {data.sharedKeywords.length === 0 && activeTab === 'compare' && (
                      <p className="text-xs text-dim text-center py-4">
                        아직 겹치는 키워드가 없습니다. 키워드 데이터가 수집되면 비교할 수 있습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-dim">
          <p className="text-sm">등록된 경쟁자가 없습니다</p>
          <p className="text-xs mt-1">같은 주제의 인플루언서를 등록해 순위를 비교해보세요</p>
        </div>
      )}
    </div>
  );
}
