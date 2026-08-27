'use client';

import { useEffect, useRef, useState } from 'react';
import DashboardCard, { DashboardCardIcon } from './DashboardCard';
import { UNRANKED_STATUS_TITLE } from '@/lib/keyword/aggregate';

interface ChallengeStatsProps {
  totalKeywords: number;
  rankedKeywords: number;
  rank1Count: number;
  top3Count: number;
  /**
   * 순위가 아직 확인되지 않은 참여 키워드 수.
   *
   * 예전엔 이 자리에 `is_integrated_top3` 개수를 넣은 '챌린지 TOP 3' 박스가 있었는데,
   * 그 값은 세 writer 가 전부 `rank <= 3` 으로만 쓰므로 'TOP 3 달성률'의 분자와
   * 똑같은 수였다(같은 걸 두 번 보여준 셈). 게다가 저장된 플래그를 읽어서
   * 집계 SoT(aggregate.ts 버킷)와 어긋날 여지도 있었다.
   * 중복 대신, 화면에 없던 '순위 없음'(≠ 순위가 낮음)을 드러낸다.
   */
  unrankedCount: number;
  avgParticipants: number;
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
  unrankedCount,
  avgParticipants,
}: ChallengeStatsProps) {
  const top3Rate = totalKeywords > 0 ? Math.round((top3Count / totalKeywords) * 100) : 0;

  return (
    <DashboardCard
      title="키워드챌린지 참여 현황"
      icon={
        <DashboardCardIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </DashboardCardIcon>
      }
    >
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
          label="TOP 10 키워드"
          value={rankedKeywords}
          suffix="개"
          color="text-up"
          sub={totalKeywords > 0 ? `${Math.round((rankedKeywords / totalKeywords) * 100)}%` : undefined}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          }
        />
        <StatBox
          label="챌린지 1위"
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
          sub={`${top3Count}/${totalKeywords}`}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          }
        />
        <StatBox
          label="순위 없음"
          value={unrankedCount}
          suffix="개"
          color="text-dim"
          title={UNRANKED_STATUS_TITLE}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
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
    </DashboardCard>
  );
}

function StatBox({
  label,
  value,
  suffix,
  color,
  sub,
  icon,
  title,
}: {
  label: string;
  value: number;
  suffix: string;
  color: string;
  sub?: string;
  icon: React.ReactNode;
  /** 마우스를 올리면 뜨는 설명. '순위 없음'처럼 오해하기 쉬운 상태에 붙인다. */
  title?: string;
}) {
  return (
    <div
      className="h-[76px] rounded-xl bg-bg border border-border/50 p-4 flex flex-col justify-between"
      title={title}
    >
      <div className="flex items-center gap-1.5 text-dim">
        {icon}
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-black ${color}`}>
          <AnimatedNumber value={value} suffix={suffix} />
        </span>
        {sub && <span className="text-[11px] text-dim">({sub})</span>}
      </div>
    </div>
  );
}
