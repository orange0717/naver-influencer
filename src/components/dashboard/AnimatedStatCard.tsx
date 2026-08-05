'use client';

import { useEffect, useState, useRef, ReactNode } from 'react';
import Link from 'next/link';

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
  /** 지정 시 카드 전체가 링크가 되어 클릭하면 해당 상세 페이지로 이동 */
  href?: string;
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
  href,
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
  const heightClass = size === 'stat' ? 'h-[182px]' : 'h-[150px]';
  const valueSizeClass = size === 'stat' ? 'stat-value-stat' : 'stat-value-kpi';
  // KPI 카드(142px)는 아이콘·타이틀·숫자 3단만 담는 구조라 description 줄을 아예 안 그림 —
  // 174px짜리 Statistics 카드 전용 여백(mb-3/min-h-28px/pt-2)을 그대로 쓰면 142px 안에 다 안 들어가
  // 숫자 줄이 카드 테두리 밖으로 흘러넘치던 문제를 해결. (글자크기 상향 후에도 여유 있도록 카드 높이 +12~14px)
  const isKpi = size === 'kpi';

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  // 정수는 그대로, 소수(예: 평균순위 8.4)는 애니메이션 중에도 소수점 자리수를 유지한다
  // (기존엔 Math.round만 써서 8.4 같은 값이 최종 프레임에도 8로 반올림돼버렸음)
  const decimals = Number.isInteger(value) ? 0 : (value.toString().split('.')[1]?.length ?? 1);

  useEffect(() => {
    if (!isVisible || value === 0) return;
    const duration = 800;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(parseFloat((value * eased).toFixed(decimals)));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, value, decimals]);

  const card = (
    <div
      ref={ref}
      className={`
        ${heightClass} flex flex-col min-w-0
        bg-gradient-to-br ${c.bg} bg-surface
        rounded-2xl border border-border p-4
        shadow-xs
        transition-all duration-500 ease-out
        hover:-translate-y-0.5 hover:shadow-lg ${c.hoverBorder}
        ${href ? 'cursor-pointer' : ''}
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        ${className}
      `}
    >
      <div className={`flex items-start justify-between ${isKpi ? 'mb-2' : 'mb-3'} shrink-0`}>
        <div className={`w-8 h-8 rounded-full bg-[#FAF4F2] ${c.text} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} color={c.spark} />
        )}
      </div>
      <p className={`stat-title ${isKpi ? 'mb-0.5' : 'mb-1'} shrink-0`}>{label}</p>
      {!isKpi && (
        <p className="stat-desc line-clamp-2 min-h-[28px] shrink-0">
          {description || ' '}
        </p>
      )}
      <div className={`mt-auto flex items-baseline gap-1.5 ${isKpi ? 'pt-1' : 'pt-2'} shrink-0`}>
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

  if (href) {
    return <Link href={href} className="block">{card}</Link>;
  }
  return card;
}
