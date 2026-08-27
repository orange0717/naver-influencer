'use client';

import { briefingEmptyReason } from '@/lib/keyword/briefing';

interface BriefingProps {
  rankUpCount: number;
  rankDownCount: number;
  top3Entered: number;
  top3Exited: number;
  bestUp: { keyword: string; change: number } | null;
  worstDown: { keyword: string; change: number } | null;
  dataDateLabel: string;
  /** 순위가 확인된 키워드 수. 0이면 "변동 없음"이 아니라 "아직 확인 안 함"이다. */
  trackedCount: number;
  /** 이전 순위가 있어 변동을 계산할 수 있었던 키워드 수. 0이면 첫 측정이라 비교 대상이 없다. */
  comparableCount: number;
}

interface BriefingItem {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  show: boolean;
}

export default function DailyBriefing({
  rankUpCount,
  rankDownCount,
  top3Entered,
  top3Exited,
  bestUp,
  worstDown,
  dataDateLabel,
  trackedCount,
  comparableCount,
}: BriefingProps) {
  const hasAnyChange = rankUpCount > 0 || rankDownCount > 0 || top3Entered > 0 || top3Exited > 0;

  // 변동이 없다고 섹션을 통째로 없애면 "변동이 없는 것"과 "고장/미확인"을 구분할 수 없다.
  // 카드는 그대로 두고 왜 비어 있는지만 말해준다.
  if (!hasAnyChange && !bestUp && !worstDown) {
    return (
      <BriefingShell dataDateLabel={dataDateLabel}>
        <EmptyReason trackedCount={trackedCount} comparableCount={comparableCount} />
      </BriefingShell>
    );
  }

  const items: BriefingItem[] = [
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
      label: '순위 상승',
      value: `${rankUpCount}개`,
      color: rankUpCount > 0 ? 'text-up' : 'text-dim',
      show: rankUpCount > 0,
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>,
      label: '순위 하락',
      value: `${rankDownCount}개`,
      color: rankDownCount > 0 ? 'text-down' : 'text-dim',
      show: rankDownCount > 0,
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
      label: 'TOP3 진입',
      value: `${top3Entered}개`,
      color: 'text-yellow-500',
      show: top3Entered > 0,
    },
    {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
      label: 'TOP3 이탈',
      value: `${top3Exited}개`,
      color: 'text-down',
      show: top3Exited > 0,
    },
  ];

  const visibleItems = items.filter(i => i.show);
  if (visibleItems.length === 0 && !bestUp && !worstDown) {
    return (
      <BriefingShell dataDateLabel={dataDateLabel}>
        <EmptyReason trackedCount={trackedCount} comparableCount={comparableCount} />
      </BriefingShell>
    );
  }

  return (
    <BriefingShell dataDateLabel={dataDateLabel}>
      {/* 변동 요약 그리드 */}
      {visibleItems.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3">
          {visibleItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-surface/80 rounded-lg px-3 py-1.5 border border-border/30">
              <span className={item.color}>{item.icon}</span>
              <span className="text-[11px] text-dim">{item.label}</span>
              <span className={`text-sm font-black font-rank ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* 주요 변동 하이라이트 */}
      {(bestUp || worstDown) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {bestUp && (
            <span className="bg-up/10 text-up rounded-full px-3 py-1">
              <strong>{bestUp.keyword}</strong> +{bestUp.change}단계 상승
            </span>
          )}
          {worstDown && (
            <span className="bg-down/10 text-down rounded-full px-3 py-1">
              <strong>{worstDown.keyword}</strong> {worstDown.change}단계 하락
            </span>
          )}
        </div>
      )}
    </BriefingShell>
  );
}

/** 카드 껍데기 — 변동이 있든 없든 같은 자리에 같은 모양으로 남는다. */
function BriefingShell({
  dataDateLabel,
  children,
}: {
  dataDateLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-lg border border-accent/15 shadow-xs p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold text-text">오늘의 브리핑</h3>
        {dataDateLabel && (
          <span className="text-[10px] text-dim">{dataDateLabel}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * 왜 브리핑이 비었는지 설명한다.
 *
 * "변동 없음"과 "아직 확인하지 않음"은 전혀 다른 상태인데, 예전엔 둘 다 섹션이
 * 통째로 사라져서 사용자가 고장인지 원래 그런 건지 알 수 없었다.
 * 추측하지 않고, 우리가 실제로 아는 것만 말한다.
 */
function EmptyReason({
  trackedCount,
  comparableCount,
}: {
  trackedCount: number;
  comparableCount: number;
}) {
  const { title, detail } = briefingEmptyReason(trackedCount, comparableCount);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-bold text-text">{title}</span>
      <span className="text-[11px] text-dim leading-relaxed">{detail}</span>
    </div>
  );
}
