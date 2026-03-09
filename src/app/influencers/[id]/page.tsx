'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { mockInfluencers } from '@/data/mock-influencers';
import { mockKeywords } from '@/data/mock-keywords';
import RankBadge from '@/components/RankBadge';
import LockOverlay from '@/components/LockOverlay';

function getInfluencerKeywords(influencerId: string) {
  const influencer = mockInfluencers.find(i => i.id === influencerId);
  if (!influencer) return [];
  const count = Math.min(influencer.total_keywords, mockKeywords.length);
  return mockKeywords.slice(0, count).map((kw, idx) => ({
    keyword_id: kw.id,
    keyword: kw.keyword,
    category: kw.category,
    rank_position: idx + 1,
    participant_count: kw.participant_count,
    search_volume_monthly: kw.search_volume_monthly,
    is_integrated_top3: idx < 3,
  }));
}

export default function InfluencerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [unlocked, setUnlocked] = useState(false);
  const influencer = mockInfluencers.find(i => i.id === id || i.naver_id === id);

  if (!influencer) {
    return (
      <div className="text-center mt-12 space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center text-down text-xl font-bold">?</div>
        <p className="font-bold">인플루언서를 찾을 수 없습니다</p>
        <Link href="/keywords" className="text-accent text-sm">← 키워드 목록으로</Link>
      </div>
    );
  }

  const keywords = getInfluencerKeywords(influencer.id);

  return (
    <div className="space-y-6">
      {/* 프로필 헤더 */}
      <div className="bg-surface rounded-2xl border border-border p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center text-2xl font-bold text-accent">
            {influencer.display_name[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{influencer.display_name}</h1>
            <p className="text-sm text-dim">{influencer.sub_category}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-dim">
              <span>팬 {influencer.fan_count.toLocaleString()}</span>
              <span>블로그 이웃 {influencer.blog_neighbor_count.toLocaleString()}+</span>
              <span>{influencer.stats_summary}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-lg font-bold text-accent font-rank">{influencer.total_keywords}</p>
            <p className="text-xs text-dim">참여 키워드</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-rank">{influencer.avg_rank}</p>
            <p className="text-xs text-dim">평균 순위</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-up font-rank">{influencer.best_rank}</p>
            <p className="text-xs text-dim">최고 순위</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gold font-rank">{influencer.integrated_top3_count}</p>
            <p className="text-xs text-dim">통합 TOP3</p>
          </div>
        </div>
      </div>

      {/* 참여 키워드 */}
      <div className="relative">
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h2 className="font-bold text-sm">참여 키워드 목록</h2>
            <span className="text-xs text-dim font-rank">{keywords.length}개</span>
          </div>

          {/* Desktop table */}
          <table className="w-full text-sm hidden sm:table">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left p-3 font-semibold text-dim text-xs">키워드</th>
                <th className="text-center p-3 font-semibold text-dim text-xs w-14">순위</th>
                <th className="text-right p-3 font-semibold text-dim text-xs w-20">참여자</th>
                <th className="text-right p-3 font-semibold text-dim text-xs w-24 hidden md:table-cell">검색량</th>
                <th className="text-center p-3 font-semibold text-dim text-xs w-14">통합</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => (
                <tr key={kw.keyword_id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="p-3">
                    <Link href={`/keywords/${kw.keyword_id}`} className="font-medium hover:text-accent transition-colors">{kw.keyword}</Link>
                    <span className="text-xs text-dim ml-2">{kw.category}</span>
                  </td>
                  <td className="text-center p-3"><RankBadge rank={kw.rank_position} size="sm" /></td>
                  <td className="text-right p-3 text-dim font-rank">{kw.participant_count}명</td>
                  <td className="text-right p-3 font-medium hidden md:table-cell font-rank">{kw.search_volume_monthly.toLocaleString()}</td>
                  <td className="text-center p-3">{kw.is_integrated_top3 && <span className="text-gold">T3</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border/50">
            {keywords.map((kw) => (
              <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`} className="block p-4 hover:bg-surface-hover transition">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-sm">{kw.keyword}</span>
                    <span className="text-xs text-dim ml-2">{kw.category}</span>
                  </div>
                  {kw.is_integrated_top3 && <span className="text-gold text-sm">T3</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div>
                    <RankBadge rank={kw.rank_position} size="sm" />
                    <p className="text-[10px] text-dim mt-1">순위</p>
                  </div>
                  <div>
                    <p className="font-rank text-dim">{kw.participant_count}명</p>
                    <p className="text-[10px] text-dim">참여자</p>
                  </div>
                  <div>
                    <p className="font-rank font-medium">{(kw.search_volume_monthly / 1000).toFixed(0)}K</p>
                    <p className="text-[10px] text-dim">검색량</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {!unlocked && (
          <div className="absolute inset-0 top-[45%]">
            <LockOverlay />
          </div>
        )}
      </div>
    </div>
  );
}
