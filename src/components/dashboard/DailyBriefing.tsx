'use client';

interface BriefingProps {
  rankUpCount: number;
  rankDownCount: number;
  top3Entered: number;
  top3Exited: number;
  bestUp: { keyword: string; change: number } | null;
  worstDown: { keyword: string; change: number } | null;
  dataDateLabel: string;
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
}: BriefingProps) {
  const hasAnyChange = rankUpCount > 0 || rankDownCount > 0 || top3Entered > 0 || top3Exited > 0;
  if (!hasAnyChange && !bestUp && !worstDown) return null;

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
  if (visibleItems.length === 0 && !bestUp && !worstDown) return null;

  return (
    <div className="bg-gradient-to-br from-surface to-accent/[0.04] rounded-2xl border border-accent/15 shadow-xs p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold text-text">오늘의 브리핑</h3>
        {dataDateLabel && (
          <span className="text-[10px] text-dim">{dataDateLabel}</span>
        )}
      </div>

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
    </div>
  );
}
