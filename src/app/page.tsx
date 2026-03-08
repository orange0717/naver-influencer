'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import TrendBadge from '@/components/TrendBadge';
import { Keyword, Recommendation } from '@/lib/types';

export default function Dashboard() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [totalKeywords, setTotalKeywords] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [kwRes, recRes] = await Promise.all([
          fetch('/api/keywords?limit=50&page=1'),
          fetch('/api/recommendations'),
        ]);
        const kwData = await kwRes.json();
        const recData = await recRes.json();

        setKeywords(kwData.keywords || []);
        setTotalKeywords(kwData.total || 0);
        setRecommendations(recData.recommendations || []);
      } catch (err) {
        console.error('데이터 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-dim">네이버에서 실시간 데이터를 가져오는 중...</p>
        </div>
      </div>
    );
  }

  const todayRecs = recommendations.length;

  return (
    <div className="space-y-8">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="KW" label="전체 키워드" value={totalKeywords} sub="네이버 키워드챌린지" color="accent" />
        <StatCard icon="REC" label="오늘의 추천" value={todayRecs} sub="블루오션 키워드" color="green" />
        <StatCard icon="CAT" label="카테고리" value={20} sub="전체 분류" color="blue" />
        <StatCard icon="LIVE" label="데이터 소스" value="LIVE" sub="실시간 크롤링" color="purple" />
      </div>

      {/* 오늘의 추천 키워드 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-text">오늘의 추천 키워드</h2>
          <span className="text-xs text-dim">참여자 적은 블루오션 키워드</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {recommendations.slice(0, 3).map(rec => (
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
                <span className="text-dim">추천 점수</span>
                <span className="font-bold text-accent">{rec.recommendation_score}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border text-xs text-dim">{rec.reason}</div>
            </Link>
          ))}
        </div>

        {/* 나머지 추천 키워드 */}
        {recommendations.length > 3 && (
          <div className="mt-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
              {recommendations.slice(3).map(rec => (
                <Link key={rec.id} href={`/keywords/${rec.keyword_id}`}
                  className="bg-surface rounded-xl border border-border p-4 hover:border-accent/40 hover:bg-surface-hover transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-accent bg-accent/12 px-2 py-0.5 rounded">#{rec.rank_in_day}</span>
                    <TrendBadge direction={rec.trend_direction} percentage={rec.trend_percentage} />
                  </div>
                  <div className="text-sm font-bold mb-1">{rec.keyword}</div>
                  <div className="text-xs text-dim">{rec.category} · {rec.reason}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 인기 키워드 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-text">참여자 TOP 10</h2>
          <Link href="/keywords" className="text-xs text-accent font-bold hover:underline">전체보기 →</Link>
        </div>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">#</th>
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">키워드</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs">카테고리</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs hidden sm:table-cell">참여자</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs">경쟁도</th>
              </tr>
            </thead>
            <tbody>
              {keywords.slice(0, 10).map((kw, i) => (
                <tr key={kw.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="py-3 px-4 font-bold text-dim font-rank">{i + 1}</td>
                  <td className="py-3 px-4">
                    <Link href={`/keywords/${kw.id}`} className="font-bold hover:text-accent transition-colors">
                      {kw.keyword}
                    </Link>
                    <span className="block text-xs text-dim">{kw.category}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-dim">{kw.category}</td>
                  <td className="py-3 px-4 text-right font-bold font-rank hidden sm:table-cell">{kw.participant_count}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      kw.competition_level === 'low' ? 'text-up bg-up/12' :
                      kw.competition_level === 'medium' ? 'text-gold bg-gold/12' :
                      'text-down bg-down/12'
                    }`}>
                      {kw.competition_level === 'low' ? '낮음' : kw.competition_level === 'medium' ? '보통' : '높음'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
