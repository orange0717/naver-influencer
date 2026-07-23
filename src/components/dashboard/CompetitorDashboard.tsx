'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatCount } from '@/lib/format';
import CompetitorCompareView from './CompetitorCompareView';
import CompetitorChanges from './CompetitorChanges';

interface WatchedCompetitor {
  watch_id: string;
  naver_id: string;
  display_name: string;
  image_url: string;
  category: string;
  subscriber_count: number;
}

interface SearchResult {
  naverId: string;
  name: string;
  imageUrl: string;
  myKeywordCategory: string;
  subscriberCount: number;
}

interface CompareData {
  competitor: { naverId: string; displayName: string; subscriberCount: number };
  stats: { totalKeywords: number; top3Count: number; top10Count: number; avgRank: number };
  sharedKeywords: { keyword: string; keyword_id: string; myRank: number | null; competitorRank: number }[];
  sharedCount: number;
}

export default function CompetitorDashboard({
  naverId,
}: {
  naverId: string;
}) {
  const [competitors, setCompetitors] = useState<WatchedCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<Record<string, CompareData>>({});
  const [loadingCompare, setLoadingCompare] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 경쟁자 목록 로드
  const fetchCompetitors = useCallback(async () => {
    try {
      const res = await fetch('/api/my/competitors');
      if (res.ok) {
        const data = await res.json();
        setCompetitors(data.competitors || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCompetitors(); }, [fetchCompetitors]);

  // 외부 클릭으로 검색 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 인플루언서 검색 (디바운스)
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    // URL 입력 시 naver_id 자동 추출 (https://in.naver.com/xxx)
    let searchTerm = query.trim();
    const urlMatch = searchTerm.match(/in\.naver\.com\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) searchTerm = urlMatch[1];

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/influencers?search=${encodeURIComponent(searchTerm)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          // 자기 자신 + 이미 추가된 경쟁자 제외
          const existing = new Set(competitors.map(c => c.naver_id));
          existing.add(naverId);
          setSearchResults(
            (data.influencers || [])
              .filter((inf: SearchResult) => !existing.has(inf.naverId))
              .slice(0, 5)
          );
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  };

  // 경쟁자 추가
  const addCompetitor = async (result: SearchResult) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    try {
      const res = await fetch('/api/my/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naver_id: result.naverId }),
      });
      if (res.ok) {
        await fetchCompetitors();
      } else {
        const data = await res.json();
        alert(data.error || '추가에 실패했습니다.');
      }
    } catch { /* ignore */ }
  };

  // 경쟁자 삭제
  const removeCompetitor = async (watchId: string) => {
    const original = competitors;
    setCompetitors(prev => prev.filter(c => c.watch_id !== watchId));

    try {
      await fetch(`/api/my/competitors?id=${watchId}`, { method: 'DELETE' });
    } catch {
      setCompetitors(original);
    }
  };

  // 경쟁자 정보 로드 (단독)
  const loadCompare = async (competitorNaverId: string) => {
    if (compareData[competitorNaverId]) return;
    setLoadingCompare(competitorNaverId);
    try {
      const res = await fetch(
        `/api/competitors?naverId=${encodeURIComponent(competitorNaverId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setCompareData(prev => ({ ...prev, [competitorNaverId]: data }));
      } else if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || '오늘의 경쟁자 분석 횟수를 모두 사용했습니다.');
        setExpandedId(null);
      }
    } catch { /* ignore */ }
    setLoadingCompare(null);
  };

  // 카드 클릭 → 펼치기/접기
  const toggleExpand = (comp: WatchedCompetitor) => {
    if (expandedId === comp.naver_id) {
      setExpandedId(null);
    } else {
      setExpandedId(comp.naver_id);
      loadCompare(comp.naver_id);
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-xs p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[15px]">경쟁자 분석</h3>
        {competitors.length > 0 && (
          <span className="text-[11px] text-dim">{competitors.length}/5명</span>
        )}
      </div>

      {/* 경쟁자 추가 */}
      <div className="relative mb-4" ref={searchRef}>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              handleSearch(e.target.value);
              setShowSearch(true);
            }}
            onFocus={() => searchQuery.trim() && setShowSearch(true)}
            placeholder="이름, ID 또는 URL (in.naver.com/xxx)..."
            className="w-full px-3 py-2 text-sm bg-bg border border-border rounded-lg outline-none focus:border-accent/40 transition-colors"
            disabled={competitors.length >= 5}
          />
        </div>

        {/* 검색 결과 드롭다운 */}
        {showSearch && (searchResults.length > 0 || searching) && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {searching ? (
              <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : (
              searchResults.map(r => (
                <button
                  key={r.naverId}
                  onClick={() => addCompetitor(r)}
                  className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent/5 transition-colors cursor-pointer"
                >
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-border/40 flex items-center justify-center text-[10px] text-dim font-bold">
                      {(r.name || r.naverId).charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold truncate">{r.name || r.naverId}</p>
                    <p className="text-[10px] text-dim">{r.myKeywordCategory} / 팬 {formatCount(r.subscriberCount)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 경쟁자 목록 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : competitors.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-dim">경쟁 인플루언서를 추가해서 비교해보세요</p>
          <p className="text-[11px] text-dim mt-1">최대 5명까지 추가할 수 있습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {competitors.map(comp => {
            const isExpanded = expandedId === comp.naver_id;
            const data = compareData[comp.naver_id];
            const isLoading = loadingCompare === comp.naver_id;

            return (
              <div key={comp.watch_id} className="rounded-xl border border-border/50 overflow-hidden">
                {/* 카드 헤더 */}
                <button
                  onClick={() => toggleExpand(comp)}
                  className={`w-full p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                    isExpanded ? 'bg-accent/[0.03]' : 'hover:bg-accent/[0.02]'
                  }`}
                >
                  {/* 프로필 이미지 */}
                  {comp.image_url ? (
                    <img src={comp.image_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-border/40 flex items-center justify-center text-xs text-dim font-bold shrink-0">
                      {(comp.display_name || comp.naver_id).charAt(0)}
                    </div>
                  )}

                  {/* 정보 */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold truncate">{comp.display_name || comp.naver_id}</p>
                    <p className="text-[10px] text-dim">
                      {comp.category} / 팬 {formatCount(comp.subscriber_count)}
                      {data && ` / 키워드 ${data.stats.totalKeywords}개`}
                    </p>
                  </div>

                  {/* 간략 통계 (데이터 로드 후) */}
                  {data && (
                    <div className="hidden sm:flex items-center gap-3 text-[11px] shrink-0">
                      <span className="text-dim">TOP3 <strong className="text-text font-rank">{data.stats.top3Count}</strong></span>
                    </div>
                  )}

                  {/* 펼침 화살표 */}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round"
                    className={`shrink-0 text-dim transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* 펼친 상세 비교 */}
                {isExpanded && (
                  <div className="border-t border-border/30 p-4 space-y-4">
                    {isLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      </div>
                    ) : data ? (
                      <>
                        {/* 단독 정보 뷰 */}
                        <CompetitorCompareView
                          competitorName={data.competitor.displayName}
                          competitorStats={data.stats}
                          competitorSubscribers={data.competitor.subscriberCount}
                          keywords={data.sharedKeywords.map(sk => ({
                            keyword: sk.keyword,
                            keyword_id: sk.keyword_id,
                            competitorRank: sk.competitorRank,
                          }))}
                        />

                        {/* 최근 7일 활동 */}
                        <div className="border-t border-border/30 pt-4">
                          <CompetitorChanges
                            competitorNaverId={comp.naver_id}
                            competitorName={comp.display_name || comp.naver_id}
                          />
                        </div>

                        {/* 삭제 버튼 */}
                        <div className="flex justify-end pt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCompetitor(comp.watch_id);
                            }}
                            className="text-[11px] text-dim hover:text-down transition-colors cursor-pointer"
                          >
                            경쟁자 삭제
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-center text-sm text-dim py-4">데이터를 불러올 수 없습니다</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
