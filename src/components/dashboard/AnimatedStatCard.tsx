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
}: AnimatedStatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const colorMap = {
    accent: { text: 'text-accent', bg: 'from-accent/5 to-accent/[0.02]', icon: 'bg-accent/10 text-accent', spark: '#CC9486' },
    up: { text: 'text-up', bg: 'from-up/5 to-up/[0.02]', icon: 'bg-up/10 text-up', spark: '#2E8B57' },
    down: { text: 'text-down', bg: 'from-down/5 to-down/[0.02]', icon: 'bg-down/10 text-down', spark: '#D94848' },
    gold: { text: 'text-gold', bg: 'from-gold/5 to-gold/[0.02]', icon: 'bg-gold/10 text-gold', spark: '#D4A017' },
    dim: { text: 'text-dim', bg: 'from-border/5 to-border/[0.02]', icon: 'bg-border/30 text-dim', spark: '#999' },
  };
  const c = colorMap[value === 0 && color !== 'dim' ? 'dim' : color];

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
        bg-gradient-to-br ${c.bg} bg-surface
        rounded-2xl border border-border p-4
        shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-xl ${c.icon} flex items-center justify-center`}>
          {icon}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} color={c.spark} />
        )}
      </div>
      <p className="text-[11px] text-dim mb-0.5">{label}</p>
      {description && <p className="text-[10px] text-dim/60 mb-0.5">{description}</p>}
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-black font-rank ${c.text}`}>
          {value === 0 ? (placeholder || '—') : `${prefix}${displayValue}${suffix}`}
        </span>
        {trend && trend.value !== 0 && (
          <span className={`text-xs font-bold ${trend.direction === 'up' ? 'text-up' : 'text-down'}`}>
            {trend.direction === 'up' ? '▲' : '▼'}{Math.abs(trend.value)}
          </span>
        )}
      </div>
    </div>
  );
}
