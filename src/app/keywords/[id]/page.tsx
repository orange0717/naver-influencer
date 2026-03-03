'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import TrendBadge from '@/components/TrendBadge';
import RankBadge from '@/components/RankBadge';
import RankChange from '@/components/RankChange';
import TrendAreaChart from '@/components/TrendAreaChart';
import { mockKeywords } from '@/data/mock-keywords';
import { getRankingsForKeyword } from '@/data/mock-rankings';

const trendWeeks = ['1월1주', '1월2주', '1월3주', '1월4주', '2월1주', '2월2주', '2월3주', '2월4주', '3월1주', '3월2주', '3월3주', '3월4주'];

export default function KeywordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const kw = mockKeywords.find(k => k.id === id) || mockKeywords[0];
  const rankings = getRankingsForKeyword(kw.id);
  const [rankUnlocked, setRankUnlocked] = useState(false);

  const trendData = trendWeeks.map((w) => ({
    week: w,
    volume: Math.round(kw.search_volume_monthly * (0.7 + Math.random() * 0.6) / 4),
  }));
  const ratio = Math.round(kw.search_volume_monthly / kw.participant_count);

  return (
    <div className="space-y-6">
      <Link href="/keywords" className="text-xs text-accent font-bold hover:underline">← 키워드 목록</Link>

      {/* 헤더 */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold">{kw.keyword}</h1>
              {kw.is_new && <span className="text-xs font-bold text-accent2 bg-accent2/12 px-2 py-0.5 rounded">NEW</span>}
            </div>
            <div className="flex items-center gap-3 text-sm text-dim">
              <span>{kw.category}</span>
              <span>참여자 {kw.participant_count}명</span>
              <span>콘텐츠 {kw.content_count.toLocaleString()}개</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendBadge direction={kw.trend_direction} percentage={kw.trend_percentage} />
            <span className={`text-2xl font-extrabold font-rank ${kw.recommendation_score >= 8 ? 'text-accent' : 'text-dim'}`}>
              {kw.recommendation_score}점
            </span>
          </div>
        </div>
      </div>

      {/* 검색량 + 블루오션 */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="text-xs font-semibold text-dim mb-3">월간 검색량</div>
          <div className="text-3xl font-extrabold text-accent mb-2 font-rank">{kw.search_volume_monthly.toLocaleString()}</div>
          <div className="flex gap-4 text-xs text-dim">
            <span>PC {kw.search_volume_pc.toLocaleString()}</span>
            <span>모바일 {kw.search_volume_mobile.toLocaleString()}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex justify-between text-xs">
              <span className="text-dim">경쟁도</span>
              <span className={`font-bold ${kw.competition_level === 'low' ? 'text-up' : kw.competition_level === 'medium' ? 'text-gold' : 'text-down'}`}>
                {kw.competition_level === 'low' ? '낮음' : kw.competition_level === 'medium' ? '보통' : '높음'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="text-xs font-semibold text-dim mb-3">블루오션 지표</div>
          <div className="text-3xl font-extrabold mb-2 font-rank" style={{ color: ratio > 200 ? '#00D68F' : ratio > 100 ? '#6C5CE7' : '#888' }}>
            {ratio}:1
          </div>
          <div className="text-xs text-dim">검색량 ÷ 참여자</div>
          <div className="mt-3 pt-3 border-t border-border text-xs">
            {ratio > 200 ? (
              <span className="font-bold text-up">블루오션 — 진입 추천</span>
            ) : ratio > 100 ? (
              <span className="font-bold text-accent">적정 경쟁 — 검토 필요</span>
            ) : (
              <span className="font-bold text-down">레드오션 — 경쟁 심함</span>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="text-xs font-semibold text-dim mb-3">PC vs 모바일</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-dim">PC</span>
                <span className="font-bold font-rank">{Math.round(kw.search_volume_pc / kw.search_volume_monthly * 100)}%</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-blue rounded-full" style={{ width: `${kw.search_volume_pc / kw.search_volume_monthly * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-dim">모바일</span>
                <span className="font-bold font-rank">{Math.round(kw.search_volume_mobile / kw.search_volume_monthly * 100)}%</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${kw.search_volume_mobile / kw.search_volume_monthly * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 트렌드 차트 (Recharts) */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold">12주 트렌드</div>
          <TrendBadge direction={kw.trend_direction} percentage={kw.trend_percentage} />
        </div>
        <TrendAreaChart data={trendData} direction={kw.trend_direction} />
      </div>

      {/* 순위 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="text-sm font-bold">인플루언서 순위</div>
          <span className="text-xs text-dim">최신 {rankings[0]?.snapshot_date}</span>
        </div>
        <div className="relative">
          {!rankUnlocked && rankings.length > 3 && (
            <div className="absolute inset-0 top-[144px] backdrop-blur-[3px] bg-bg/60 z-10 flex flex-col items-center justify-center rounded-b-xl">
              <div className="text-2xl mb-2">🔒</div>
              <div className="text-sm font-bold mb-1">4위 이하 순위 보기</div>
              <button onClick={() => setRankUnlocked(true)}
                className="mt-1 px-4 py-1.5 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
                50P 사용
              </button>
            </div>
          )}

          {/* Desktop table */}
          <table className="w-full text-sm hidden sm:table">
            <thead>
              <tr className="bg-bg/50 border-b border-border">
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim">순위</th>
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim">인플루언서</th>
                <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">카테고리</th>
                <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">변동</th>
                <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">포스트</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="py-3 px-4"><RankBadge rank={r.rank_position} size="sm" /></td>
                  <td className="py-3 px-4 font-semibold">{r.influencer_name}</td>
                  <td className="py-3 px-4 text-right text-xs text-dim">{r.influencer_category}</td>
                  <td className="py-3 px-4 text-right"><RankChange change={r.rank_change} /></td>
                  <td className="py-3 px-4 text-right text-dim font-rank">{r.post_count}개</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border/50">
            {rankings.map(r => (
              <div key={r.id} className="p-4 flex items-center gap-3">
                <RankBadge rank={r.rank_position} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.influencer_name}</p>
                  <p className="text-xs text-dim">{r.influencer_category} · 포스트 {r.post_count}개</p>
                </div>
                <RankChange change={r.rank_change} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
