'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardCard from './DashboardCard';
import { formatCount } from '@/lib/format';

interface RecommendedKeyword {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume: number;
  score: number;
}

interface Top5KeywordsProps {
  recommendations: RecommendedKeyword[];
  totalNotParticipated: number;
}

const DISPLAY_COUNT = 5;

export default function Top5Keywords({ recommendations, totalNotParticipated }: Top5KeywordsProps) {
  const [displayed, setDisplayed] = useState<RecommendedKeyword[]>(recommendations.slice(0, DISPLAY_COUNT));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    if (recommendations.length <= DISPLAY_COUNT) return;
    setIsRefreshing(true);

    // 현재 표시 중인 키워드 ID
    const currentIds = new Set(displayed.map(d => d.keyword_id));

    // 가중 랜덤 셔플: score 높은 키워드가 더 자주 선택되도록
    const pool = recommendations.filter(kw => !currentIds.has(kw.keyword_id));
    const source = pool.length >= DISPLAY_COUNT ? pool : [...recommendations];

    // Fisher-Yates 셔플
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // score 기반 가중치: 상위 50%에서 3개, 나머지에서 2개 (가능한 경우)
    const sorted = shuffled.sort((a, b) => b.score - a.score);
    const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
    const bottomHalf = sorted.slice(Math.ceil(sorted.length / 2));

    const picked: RecommendedKeyword[] = [];
    const topPick = Math.min(3, topHalf.length);
    for (let i = 0; i < topPick; i++) picked.push(topHalf[i]);
    const remaining = DISPLAY_COUNT - picked.length;
    for (let i = 0; i < Math.min(remaining, bottomHalf.length); i++) picked.push(bottomHalf[i]);
    // 부족한 경우 topHalf에서 추가
    if (picked.length < DISPLAY_COUNT) {
      for (let i = topPick; i < topHalf.length && picked.length < DISPLAY_COUNT; i++) {
        picked.push(topHalf[i]);
      }
    }

    // 순서 랜덤화
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }

    setTimeout(() => {
      setDisplayed(picked);
      setIsRefreshing(false);
    }, 300);
  }, [recommendations, displayed]);

  return (
    <DashboardCard padding="none">
      <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[15px]">오늘의 추천키워드</h3>
          <p className="text-[10px] text-dim mt-0.5">미참여 키워드 중 경쟁도 낮고 검색량 높은 키워드</p>
        </div>
        <div className="flex items-center gap-2">
          {displayed.length > 0 && (
            <span className="text-[11px] text-dim">{totalNotParticipated}개 중</span>
          )}
          {recommendations.length > DISPLAY_COUNT && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-border/30 hover:bg-accent/15 hover:text-accent text-dim transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
              title="다른 추천 보기"
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
              >
                <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {displayed.length > 0 ? (
        <div className={`divide-y divide-border/20 transition-opacity duration-200 ${isRefreshing ? 'opacity-30' : 'opacity-100'}`}>
          {displayed.map((r, i) => (
            <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition group">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                  i === 0 ? 'bg-gold/20 text-gold' : i <= 2 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
                }`}>{i + 1}</span>
                <div className="min-w-0">
                  <span className="font-semibold text-sm truncate block group-hover:text-accent transition-colors">{r.keyword}</span>
                  <span className="text-xs text-dim">{r.category} · {r.participant_count}명 참여</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.search_volume > 0 && (
                  <span className="text-[10px] text-dim bg-border/30 px-1.5 py-0.5 rounded">월 {formatCount(r.search_volume)}</span>
                )}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  r.participant_count <= 30 ? 'bg-emerald-500/15 text-emerald-600' :
                  r.participant_count <= 100 ? 'bg-amber-500/15 text-amber-600' :
                  'bg-rose-500/15 text-rose-600'
                }`}>
                  {r.participant_count <= 30 ? '낮음' : r.participant_count <= 100 ? '보통' : '높음'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-dim text-sm">
          <p>추천할 미참여 키워드가 없습니다.</p>
          <p className="text-xs mt-1">모든 키워드에 참여하고 있습니다.</p>
        </div>
      )}
    </DashboardCard>
  );
}
