'use client';

import Link from 'next/link';
import DashboardCard from './DashboardCard';
import type { RankAlert } from '@/lib/rank-alerts';

interface SmartAlertsProps {
  alerts: RankAlert[];
  maxPerColumn?: number;
}

const alertTypeConfig = {
  losing_top3: {
    badge: 'TOP3 이탈 위험',
    badgeColor: 'bg-down/15 text-down',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  drop_risk: {
    badge: '하락 위험',
    badgeColor: 'bg-down/15 text-down',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M19 12l-7 7-7-7"/>
      </svg>
    ),
  },
  top3_opportunity: {
    badge: 'TOP3 기회',
    badgeColor: 'bg-up/15 text-up',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ),
  },
  momentum_up: {
    badge: '상승 모멘텀',
    badgeColor: 'bg-up/15 text-up',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    ),
  },
};

function AlertItem({ alert }: { alert: RankAlert }) {
  const config = alertTypeConfig[alert.alertType];
  const isWarning = alert.alertType === 'drop_risk' || alert.alertType === 'losing_top3';

  return (
    <Link
      href={`/keywords/${alert.keyword_id}`}
      className={`block p-3 rounded-xl border-l-[3px] ${
        isWarning ? 'border-l-down' : 'border-l-up'
      } bg-bg/50 hover:bg-bg transition-colors`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-6 h-6 rounded-full ${
          isWarning ? 'bg-down text-white' : 'bg-up text-white'
        } flex items-center justify-center shrink-0 mt-0.5`}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-sm truncate">{alert.keyword}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${config.badgeColor}`}>
              {config.badge}
            </span>
          </div>
          <p className="text-[11px] text-dim leading-relaxed">{alert.actionMessage}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-dim font-rank">현재 {alert.currentRank}위</span>
            {alert.search_volume > 0 && (
              <span className="text-[10px] text-dim">월 {alert.search_volume.toLocaleString()}회</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function SmartAlerts({ alerts, maxPerColumn = 5 }: SmartAlertsProps) {
  if (alerts.length === 0) return null;

  const warnings = alerts
    .filter(a => a.alertType === 'drop_risk' || a.alertType === 'losing_top3')
    .slice(0, maxPerColumn);

  const opportunities = alerts
    .filter(a => a.alertType === 'top3_opportunity' || a.alertType === 'momentum_up')
    .slice(0, maxPerColumn);

  if (warnings.length === 0 && opportunities.length === 0) return null;

  return (
    <DashboardCard
      title="오늘의 액션 포인트"
      subtitle="순위 변동 트렌드 기반 자동 분석"
      headerRight={<span className="text-[11px] text-dim">{alerts.length}건 감지</span>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 좌: 주의 필요 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-2 h-2 rounded-full bg-down" />
            <span className="text-xs font-bold text-down">주의 필요</span>
            <span className="text-[11px] text-dim">{warnings.length}건</span>
          </div>
          <div className="space-y-2">
            {warnings.length > 0 ? (
              warnings.map(alert => (
                <AlertItem key={alert.keyword_id} alert={alert} />
              ))
            ) : (
              <div className="text-center py-6 text-dim text-xs bg-bg/30 rounded-xl">
                하락 위험 키워드 없음 - 안정적
              </div>
            )}
          </div>
        </div>

        {/* 우: 기회 포착 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-2 h-2 rounded-full bg-up" />
            <span className="text-xs font-bold text-up">기회 포착</span>
            <span className="text-[11px] text-dim">{opportunities.length}건</span>
          </div>
          <div className="space-y-2">
            {opportunities.length > 0 ? (
              opportunities.map(alert => (
                <AlertItem key={alert.keyword_id} alert={alert} />
              ))
            ) : (
              <div className="text-center py-6 text-dim text-xs bg-bg/30 rounded-xl">
                현재 TOP3 기회 키워드 없음
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
