'use client';

import { useState } from 'react';
import GlassCard from './GlassCard';
import type { GrowthSummary } from '@/lib/growth-analysis';

interface GrowthReportProps {
  summary7d: GrowthSummary;
  summary30d: GrowthSummary;
}

function DeltaValue({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (value === 0) return <span className="text-dim">-</span>;
  // invert: 순위는 낮을수록 좋으므로 음수가 개선
  const isPositive = invert ? value < 0 : value > 0;
  const display = invert ? Math.abs(value) : Math.abs(value);
  return (
    <span className={`text-xs font-bold ${isPositive ? 'text-up' : 'text-down'}`}>
      {isPositive ? '▲' : '▼'}{display}{suffix}
    </span>
  );
}

const trendLabels = {
  improving: { text: '상승세', color: 'text-up', bg: 'bg-up/10' },
  declining: { text: '하락세', color: 'text-down', bg: 'bg-down/10' },
  stable: { text: '안정', color: 'text-dim', bg: 'bg-border/30' },
};

export default function GrowthReport({ summary7d, summary30d }: GrowthReportProps) {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const summary = period === '7d' ? summary7d : summary30d;
  const { currentStats, previousStats, changes, overallTrend } = summary;

  const hasData = currentStats.totalKeywords > 0 || previousStats.totalKeywords > 0;
  const trend = trendLabels[overallTrend];

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-[15px]">성장 리포트</h3>
          <p className="text-[11px] text-dim mt-0.5">
            {period === '7d' ? '지난 7일 vs 이전 7일' : '지난 30일 vs 이전 30일'} 비교
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${trend.bg} ${trend.color}`}>
              {trend.text}
            </span>
          )}
          <div className="flex bg-bg rounded-lg p-0.5">
            {(['7d', '30d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                  period === p ? 'bg-surface text-text shadow-sm' : 'text-dim hover:text-text'
                }`}
              >
                {p === '7d' ? '7일' : '30일'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="text-center py-8 text-dim text-sm">
          <p>아직 비교할 데이터가 부족합니다.</p>
          <p className="text-xs mt-1">며칠 후 성장 리포트가 자동으로 생성됩니다.</p>
        </div>
      ) : (
        <>
          {/* 4개 지표 비교 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetricCard
              label="평균 순위"
              current={currentStats.avgRank > 0 ? `${currentStats.avgRank}위` : '-'}
              delta={<DeltaValue value={changes.avgRankChange} invert />}
            />
            <MetricCard
              label="TOP 3"
              current={`${currentStats.top3Count}개`}
              delta={<DeltaValue value={changes.top3CountChange} suffix="개" />}
            />
            <MetricCard
              label="참여 키워드"
              current={`${currentStats.totalKeywords}개`}
              delta={<DeltaValue value={changes.totalKeywordsChange} suffix="개" />}
            />
            <MetricCard
              label="통합검색 TOP3"
              current={`${currentStats.integratedCount}개`}
              delta={<DeltaValue value={changes.integratedCountChange} suffix="개" />}
            />
          </div>

          {/* 주요 변동 */}
          {(changes.newTop3Keywords.length > 0 || changes.lostTop3Keywords.length > 0 ||
            changes.biggestGain || changes.biggestLoss) && (
            <div className="border-t border-border/30 pt-3">
              <p className="text-[11px] text-dim font-semibold mb-2">주요 변동</p>
              <div className="space-y-1.5">
                {changes.newTop3Keywords.map(kw => (
                  <div key={kw} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-up" />
                    <span className="text-up font-semibold">TOP 3 진입</span>
                    <span className="text-text">{kw}</span>
                  </div>
                ))}
                {changes.lostTop3Keywords.map(kw => (
                  <div key={kw} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-down" />
                    <span className="text-down font-semibold">TOP 3 이탈</span>
                    <span className="text-text">{kw}</span>
                  </div>
                ))}
                {changes.biggestGain && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-up" />
                    <span className="text-up font-semibold">최대 상승</span>
                    <span className="text-text">{changes.biggestGain.keyword}</span>
                    <span className="text-dim font-rank">{changes.biggestGain.from}위 → {changes.biggestGain.to}위</span>
                  </div>
                )}
                {changes.biggestLoss && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-down" />
                    <span className="text-down font-semibold">최대 하락</span>
                    <span className="text-text">{changes.biggestLoss.keyword}</span>
                    <span className="text-dim font-rank">{changes.biggestLoss.from}위 → {changes.biggestLoss.to}위</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

function MetricCard({ label, current, delta }: { label: string; current: string; delta: React.ReactNode }) {
  return (
    <div className="bg-bg/50 rounded-xl p-3 text-center">
      <p className="text-[10px] text-dim font-semibold mb-1">{label}</p>
      <p className="text-lg font-black font-rank">{current}</p>
      <div className="mt-0.5">{delta}</div>
    </div>
  );
}
