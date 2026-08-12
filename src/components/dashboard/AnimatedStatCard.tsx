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
  /**
   * 지정 시 숫자 대신 이 상태 문구를 표시한다(예: '확인 중'·'연결 필요'·'미확인'·'확인 오류').
   * 데이터가 없거나 확인 전인 KPI에서 0을 지어내지 않기 위한 값(정확도 원칙 #5).
   */
  statusText?: string;
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
  statusText,
}: AnimatedStatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 아이콘 칩 배경은 색상 무관 단일 뉴트럴 톤으로 통일 — 글리프 색상만 컬러별로 구분
  const colorMap = {
    accent: { text: 'text-accent', spark: '#CC9486', hoverBorder: 'hover:border-accent/40' },
    up: { text: 'text-up', spark: '#2E8B57', hoverBorder: 'hover:border-up/40' },
    down: { text: 'text-down', spark: '#D94848', hoverBorder: 'hover:border-down/40' },
    gold: { text: 'text-gold', spark: '#D4A017', hoverBorder: 'hover:border-gold/40' },
    dim: { text: 'text-dim', spark: '#999', hoverBorder: 'hover:border-accent/25' },
  };
  // 상태 문구(확인 중/연결 필요 등)는 값이 아니므로 항상 뉴트럴(dim) 톤으로 표시한다.
  const c = colorMap[statusText || (value === 0 && color !== 'dim') ? 'dim' : color];
  const valueSizeClass = size === 'stat' ? 'stat-value-stat' : 'stat-value-kpi';
  const isKpi = size === 'kpi';
  // KPI 카드(홈 상단 요약바)는 고정 높이 150px 유지. Statistics 카드(size="stat", "발행·순위 통계"
  // 3~6칸 그리드)는 콘텐츠 양과 무관하게 항상 정사각형이어야 해서 aspect-square로 전환 (2026-08-08).
  const sizeClass = isKpi ? 'h-[150px]' : 'aspect-square';

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  // 정수는 그대로, 소수(예: 평균순위 8.4)는 애니메이션 중에도 소수점 자리수를 유지한다
  // (기존엔 Math.round만 써서 8.4 같은 값이 최종 프레임에도 8로 반올림돼버렸음)
  const decimals = Number.isInteger(value) ? 0 : (value.toString().split('.')[1]?.length ?? 1);

  useEffect(() => {
    if (!isVisible || value === 0 || statusText) return;
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
  }, [isVisible, value, decimals, statusText]);

  const valueRow = (
    <div className={`flex items-baseline gap-1.5 shrink-0 ${isKpi ? '' : 'justify-center'}`}>
      {statusText ? (
        <span className={`${isKpi ? 'text-sm' : 'text-base'} font-bold text-dim truncate`}>{statusText}</span>
      ) : (
        <span className={`stat-value ${valueSizeClass} ${c.text} truncate`}>
          {value === 0 ? (placeholder || '—') : `${prefix}${displayValue}${suffix}`}
        </span>
      )}
      {trend && trend.value !== 0 && (
        <span className={`text-xs font-bold shrink-0 ${trend.direction === 'up' ? 'text-up' : 'text-down'}`}>
          {trend.direction === 'up' ? '▲' : '▼'}{Math.abs(trend.value)}
        </span>
      )}
    </div>
  );

  const card = (
    <div
      ref={ref}
      className={`
        ${sizeClass} flex flex-col min-w-0
        bg-surface
        rounded-lg border border-border ${isKpi ? 'p-4' : 'p-3 sm:p-4'}
        shadow-xs
        transition-all duration-500 ease-out
        ${c.hoverBorder}
        ${href ? 'cursor-pointer' : ''}
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        ${className}
      `}
    >
      {isKpi ? (
        <>
          <div className="flex items-start justify-between mb-2 shrink-0">
            <div className={`w-7 h-7 rounded-full bg-[#FAF4F2] ${c.text} flex items-center justify-center shrink-0`}>
              {icon}
            </div>
            {sparklineData && sparklineData.length > 1 && (
              <Sparkline data={sparklineData} color={c.spark} />
            )}
          </div>
          <p className="stat-title mb-0.5 shrink-0">{label}</p>
          <div className="mt-auto pt-1">{valueRow}</div>
        </>
      ) : (
        // 정사각형(aspect-square) 카드 — 상단 아이콘 / 중앙 제목·설명 / 하단 숫자로 균등 분배.
        // justify-between이 콘텐츠 양과 무관하게 아이콘·숫자를 항상 같은 기준선에 고정시킨다.
        <div className="flex-1 flex flex-col items-center justify-between text-center min-h-0">
          <div className={`w-8 h-8 rounded-full bg-[#FAF4F2] ${c.text} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div className="flex flex-col items-center gap-1 px-1 min-w-0 w-full">
            <p className="stat-title">{label}</p>
            <p className="stat-desc line-clamp-2">{description || ' '}</p>
          </div>
          {valueRow}
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{card}</Link>;
  }
  return card;
}
