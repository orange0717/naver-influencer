'use client';

import { useEffect, useState, useRef, ReactNode } from 'react';

interface AnimatedStatCardProps {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  placeholder?: string; // value=0일 때 표시할 텍스트 (기본: '—')
  description?: string; // label 아래 작은 설명 텍스트
  trend?: { direction: 'up' | 'down' | 'stable'; value: number };
  icon?: ReactNode;
  color?: 'accent' | 'up' | 'down' | 'gold' | 'dim';
  sparklineData?: number[];
  delay?: number;
  className?: string; // grid 내 col-span 등 배치 오버라이드용
  /** 'kpi' = 상단 요약 8칸/6칸 (130px, 18px 숫자) · 'stat' = 발행/순위 등 3칸 그리드 (160px, 20px 숫자) */
  size?: 'kpi' | 'stat';
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="opacity-40">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AnimatedStatCard({
  label,
  value,
  suffix = '',
  prefix = '',
  placeholder,
  description,
  trend,
  icon,
  color = 'accent',
  sparklineData,
  delay = 0,
  className = '',
  size = 'kpi',
}: AnimatedStatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 아이콘 칩 배경은 색상 무관 단일 뉴트럴 톤으로 통일 — 글리프 색상만 컬러별로 구분
  const colorMap = {
    accent: { text: 'text-accent', bg: 'from-accent/5 to-accent/[0.02]', spark: '#CC9486', hoverBorder: 'hover:border-accent/40' },
    up: { text: 'text-up', bg: 'from-up/5 to-up/[0.02]', spark: '#2E8B57', hoverBorder: 'hover:border-up/40' },
    down: { text: 'text-down', bg: 'from-down/5 to-down/[0.02]', spark: '#D94848', hoverBorder: 'hover:border-down/40' },
    gold: { text: 'text-gold', bg: 'from-gold/5 to-gold/[0.02]', spark: '#D4A017', hoverBorder: 'hover:border-gold/40' },
    dim: { text: 'text-dim', bg: 'from-border/5 to-border/[0.02]', spark: '#999', hoverBorder: 'hover:border-accent/25' },
  };
  const c = colorMap[value === 0 && color !== 'dim' ? 'dim' : color];
  const heightClass = size === 'stat' ? 'h-40' : 'h-[130px]';
  const valueSizeClass = size === 'stat' ? 'stat-value-stat' : 'stat-value-kpi';

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isVisible || value === 0) return;
    const duration = 800;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, value]);

  return (
    <div
      ref={ref}
      className={`
        ${heightClass} flex flex-col min-w-0
        bg-gradient-to-br ${c.bg} bg-surface
        rounded-2xl border border-border p-5
        shadow-xs
        transition-all duration-500 ease-out
        hover:-translate-y-0.5 hover:shadow-lg ${c.hoverBorder}
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        ${className}
      `}
    >
      <div className="flex items-start justify-between mb-3 shrink-0">
        <div className={`w-8 h-8 rounded-full bg-[#FAF4F2] ${c.text} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} color={c.spark} />
        )}
      </div>
      <p className="stat-title mb-1 shrink-0">{label}</p>
      <p className="stat-desc line-clamp-2 min-h-[28px] shrink-0">
        {description || ' '}
      </p>
      <div className="mt-auto flex items-baseline gap-1.5 pt-2 shrink-0">
        <span className={`stat-value ${valueSizeClass} ${c.text} truncate`}>
          {value === 0 ? (placeholder || '—') : `${prefix}${displayValue}${suffix}`}
        </span>
        {trend && trend.value !== 0 && (
          <span className={`text-xs font-bold shrink-0 ${trend.direction === 'up' ? 'text-up' : 'text-down'}`}>
            {trend.direction === 'up' ? '▲' : '▼'}{Math.abs(trend.value)}
          </span>
        )}
      </div>
    </div>
  );
}
