'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { CHART } from '@/lib/chart-colors';
import DashboardCard, { DashboardCardIcon } from './DashboardCard';

interface VisitorData {
  date: string;
  count: number;
}

interface Props {
  blogId: string;
}

export default function BlogVisitorChart({ blogId }: Props) {
  const [visitors, setVisitors] = useState<VisitorData[]>([]);
  const [todayVisitors, setTodayVisitors] = useState(0);
  const [avgVisitors, setAvgVisitors] = useState(0);
  const [trend, setTrend] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVisitors() {
      try {
        const res = await fetch(`/api/blog/visitors?blogId=${blogId}&days=30`);
        if (res.ok) {
          const data = await res.json();
          setVisitors(data.visitors || []);
          setTodayVisitors(data.todayVisitors || 0);
          setAvgVisitors(data.avgVisitors || 0);
          setTrend(data.trend || 0);
        }
      } catch {
        // 실패 무시
      } finally {
        setLoading(false);
      }
    }
    fetchVisitors();
  }, [blogId]);

  if (loading) {
    return (
      <DashboardCard
        title="블로그 방문자수"
        icon={
          <DashboardCardIcon>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </DashboardCardIcon>
        }
      >
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </DashboardCard>
    );
  }

  if (visitors.length === 0) {
    return (
      <DashboardCard
        title="블로그 방문자수"
        icon={
          <DashboardCardIcon className="bg-border/30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </DashboardCardIcon>
        }
      >
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-dim">방문자 데이터가 아직 수집되지 않았습니다.</p>
          <div className="text-xs text-dim bg-bg rounded-xl p-3 text-left space-y-1.5 max-w-sm mx-auto">
            <p className="font-semibold text-text">방문자수 수집을 위해 아래 설정이 필요합니다:</p>
            <p>1. 네이버 블로그 관리 &gt; 메뉴-글-동영상 관리</p>
            <p>2. 위젯 사용 설정 &gt; 방문자수 카운터 ON</p>
            <p>3. 설정 완료 후 다음 날부터 자동 수집됩니다.</p>
          </div>
        </div>
      </DashboardCard>
    );
  }

  const chartData = visitors.map(v => ({
    date: v.date.slice(5),
    visitors: v.count,
  }));

  return (
    <DashboardCard
      title="블로그 방문자수"
      subtitle="최근 30일 일별 방문자 추이"
      icon={
        <DashboardCardIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </DashboardCardIcon>
      }
      headerRight={
        <div className="text-right">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-black">{todayVisitors.toLocaleString()}</span>
            <span className="text-xs text-dim">오늘</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-dim">평균 {avgVisitors.toLocaleString()}</span>
            {trend !== 0 && (
              <span className={`text-[10px] font-bold ${trend > 0 ? 'text-up' : 'text-down'}`}>
                {trend > 0 ? '▲' : '▼'}{Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="visitorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F29C68" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#F29C68" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
          <XAxis
            dataKey="date"
            tick={{ fill: CHART.tickFill, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
          />
          <YAxis
            tick={{ fill: CHART.tickFill, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          />
          <Tooltip
            contentStyle={{
              background: CHART.tooltipBg,
              border: `1px solid ${CHART.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: CHART.labelFill }}
            formatter={(value: ValueType | undefined) => [Number(value).toLocaleString() + '명', '방문자']}
          />
          <Area
            type="monotone"
            dataKey="visitors"
            stroke="#F29C68"
            strokeWidth={2}
            fill="url(#visitorGrad)"
            dot={{ r: 2, fill: '#F29C68' }}
            activeDot={{ r: 4, stroke: '#F29C68' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </DashboardCard>
  );
}
