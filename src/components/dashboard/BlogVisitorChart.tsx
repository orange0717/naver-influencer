'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CHART } from '@/lib/chart-colors';
import GlassCard from './GlassCard';

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
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 className="font-bold text-[15px]">블로그 방문자수</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </GlassCard>
    );
  }

  if (visitors.length === 0) {
    return (
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-border/30 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 className="font-bold text-[15px]">블로그 방문자수</h3>
        </div>
        <p className="text-sm text-dim text-center py-4">방문자 데이터가 아직 수집되지 않았습니다.</p>
        <p className="text-xs text-dim text-center">매일 자동으로 수집됩니다.</p>
      </GlassCard>
    );
  }

  const chartData = visitors.map(v => ({
    date: v.date.slice(5),
    visitors: v.count,
  }));

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-[15px]">블로그 방문자수</h3>
            <p className="text-[10px] text-dim">최근 30일 일별 방문자 추이</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-black">{todayVisitors.toLocaleString()}</span>
            <span className="text-xs text-dim">오늘</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-dim">평균 {avgVisitors.toLocaleString()}</span>
            {trend !== 0 && (
              <span className={`text-[10px] font-bold ${trend > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {trend > 0 ? '▲' : '▼'}{Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </div>

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [Number(value).toLocaleString() + '명', '방문자']}
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
    </GlassCard>
  );
}
