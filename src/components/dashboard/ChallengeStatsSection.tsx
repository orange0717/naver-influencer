'use client';

import { useEffect, useRef, useState } from 'react';

interface ChallengeStatsProps {
  totalKeywords: number;
  rankedKeywords: number;
  rank1Count: number;
  top3Count: number;
  integratedTop3Count: number;
  avgParticipants: number;
  compLow: number;
  compMid: number;
  compHigh: number;
}

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    if (animated.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          const start = performance.now();
          const duration = 800;
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(value * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

export default function ChallengeStatsSection({
  totalKeywords,
  rankedKeywords,
  rank1Count,
  top3Count,
  integratedTop3Count,
  avgParticipants,
  compLow,
  compMid,
  compHigh,
}: ChallengeStatsProps) {
  const total = compLow + compMid + compHigh;
  const lowPct = total > 0 ? Math.round((compLow / total) * 100) : 0;
  const midPct = total > 0 ? Math.round((compMid / total) * 100) : 0;
  const highPct = total > 0 ? 100 - lowPct - midPct : 0;
  const top3Rate = rankedKeywords > 0 ? Math.round((top3Count / rankedKeywords) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </div>
        <h3 className="font-bold text-[15px]">키워드챌린지 참여 현황</h3>
      </div>

      {/* 6개 스탯 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBox
          label="참여 챌린지"
          value={totalKeywords}
          suffix="개"
          color="text-accent"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          }
        />
        <StatBox
          label="노출 챌린지"
          value={rankedKeywords}
          suffix="개"
          color="text-up"
          sub={totalKeywords > 0 ? `${Math.round((rankedKeywords / totalKeywords) * 100)}%` : undefined}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          }
        />
        <StatBox
          label="1위 달성"
          value={rank1Count}
          suffix="개"
          color="text-gold"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          }
        />
        <StatBox
          label="TOP 3 달성률"
          value={top3Rate}
          suffix="%"
          color="text-accent"
          sub={`${top3Count}/${rankedKeywords}`}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          }
        />
        <StatBox
          label="통합검색 TOP3"
          value={integratedTop3Count}
          suffix="개"
          color="text-gold"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          }
        />
        <StatBox
          label="평균 경쟁자 수"
          value={avgParticipants}
          suffix="명"
          color="text-dim"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          }
        />
      </div>

      {/* 경쟁도 분포 바 */}
      {total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-dim">
            <span>경쟁도 분포</span>
            <span>{total}개 챌린지</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-border/30">
            {lowPct > 0 && (
              <div
                className="bg-emerald-400 transition-all duration-700"
                style={{ width: `${lowPct}%` }}
                title={`낮음 ${compLow}개`}
              />
            )}
            {midPct > 0 && (
              <div
                className="bg-amber-400 transition-all duration-700"
                style={{ width: `${midPct}%` }}
                title={`보통 ${compMid}개`}
              />
            )}
            {highPct > 0 && (
              <div
                className="bg-rose-400 transition-all duration-700"
                style={{ width: `${highPct}%` }}
                title={`높음 ${compHigh}개`}
              />
            )}
          </div>
          <div className="flex gap-4 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
              낮음 {compLow}개 ({lowPct}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              보통 {compMid}개 ({midPct}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
              높음 {compHigh}개 ({highPct}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  suffix,
  color,
  sub,
  icon,
}: {
  label: string;
  value: number;
  suffix: string;
  color: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-bg border border-border/50 p-3.5 space-y-1">
      <div className="flex items-center gap-1.5 text-dim">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-black ${color}`}>
          <AnimatedNumber value={value} suffix={suffix} />
        </span>
        {sub && <span className="text-[10px] text-dim">({sub})</span>}
      </div>
    </div>
  );
}
