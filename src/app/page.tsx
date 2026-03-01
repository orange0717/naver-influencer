'use client';
import { useState } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import TrendBadge from '@/components/TrendBadge';
import { mockKeywords } from '@/data/mock-keywords';
import { mockRecommendations } from '@/data/mock-recommendations';

export default function Dashboard() {
  const [unlocked, setUnlocked] = useState(false);
  const totalKeywords = mockKeywords.length;
  const todayRecs = mockRecommendations.length;
  const trendUp = mockKeywords.filter(k => k.trend_direction === 'up').length;

  return (
    <div className="space-y-8">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📊" label="전체 키워드" value={totalKeywords} sub="키워드챌린지" color="accent" />
        <StatCard icon="⭐" label="오늘의 추천" value={todayRecs} sub="블루오션 키워드" color="green" />
        <StatCard icon="📈" label="상승 트렌드" value={trendUp} sub="최근 1주" color="blue" />
        <StatCard icon="P" label="보유 포인트" value="1,200" sub="잔액" color="purple" />
      </div>

      {/* 오늘의 추천 키워드 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-text">오늘의 추천 키워드</h2>
          <span className="text-xs text-dim">매일 06:00 갱신</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {mockRecommendations.slice(0, 3).map(rec => (
            <Link key={rec.id} href={`/keywords/${rec.keyword_id}`}
              className="bg-surface rounded-xl border border-border p-5 hover:border-accent/40 hover:bg-surface-hover transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-accent bg-accent/12 px-2 py-0.5 rounded">#{rec.rank_in_day} 추천</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-up/12 text-up">무료</span>
              </div>
              <div className="text-base font-extrabold mb-1 group-hover:text-accent transition-colors">{rec.keyword}</div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-dim">{rec.category}</span>
                <TrendBadge direction={rec.trend_direction} percentage={rec.trend_percentage} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-dim">월간 검색량</span>
                <span className="font-bold font-rank text-text">{rec.search_volume_monthly.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-dim">추천 점수</span>
                <span className="font-bold text-accent">{rec.recommendation_score}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border text-xs text-dim">{rec.reason}</div>
            </Link>
          ))}
        </div>

        {/* 잠금된 추천 */}
        <div className="mt-4 relative">
          {!unlocked && (
            <div className="absolute inset-0 backdrop-blur-[3px] bg-bg/60 z-10 rounded-xl flex flex-col items-center justify-center">
              <div className="text-3xl mb-3">🔒</div>
              <div className="text-sm font-bold text-text mb-1">나머지 {mockRecommendations.length - 3}개 추천 키워드</div>
              <button onClick={() => setUnlocked(true)}
                className="mt-2 px-5 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
                50P로 전체 열기
              </button>
            </div>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {mockRecommendations.slice(3).map(rec => (
              <Link key={rec.id} href={unlocked ? `/keywords/${rec.keyword_id}` : '#'}
                className={`bg-surface rounded-xl border border-border p-4 ${unlocked ? 'hover:border-accent/40' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-dim">#{rec.rank_in_day}</span>
                  <TrendBadge direction={rec.trend_direction} percentage={rec.trend_percentage} />
                </div>
                <div className="text-sm font-bold mb-1">{rec.keyword}</div>
                <div className="text-xs text-dim">{rec.category} · 검색량 {rec.search_volume_monthly.toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 인기 키워드 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-text">인기 키워드 TOP 5</h2>
          <Link href="/keywords" className="text-xs text-accent font-bold hover:underline">전체보기 →</Link>
        </div>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">#</th>
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">키워드</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs">검색량</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs hidden sm:table-cell">참여자</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs">트렌드</th>
              </tr>
            </thead>
            <tbody>
              {[...mockKeywords].sort((a, b) => b.search_volume_monthly - a.search_volume_monthly).slice(0, 5).map((kw, i) => (
                <tr key={kw.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="py-3 px-4 font-bold text-dim font-rank">{i + 1}</td>
                  <td className="py-3 px-4">
                    <Link href={`/keywords/${kw.id}`} className="font-bold hover:text-accent transition-colors">
                      {kw.keyword}
                      {kw.is_new && <span className="ml-1.5 text-[10px] font-bold text-accent2 bg-accent2/12 px-1.5 py-0.5 rounded">NEW</span>}
                    </Link>
                    <span className="block text-xs text-dim">{kw.category}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold font-rank">{kw.search_volume_monthly.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-dim hidden sm:table-cell">{kw.participant_count}</td>
                  <td className="py-3 px-4 text-right"><TrendBadge direction={kw.trend_direction} percentage={kw.trend_percentage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
