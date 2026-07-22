'use client';

import { useEffect, useState } from 'react';

interface GradeGaugeProps {
  score: number;
  label: string;
  description: string;
  color: string;
  delay?: number;
}

export default function GradeGauge({ score, label, description, color, delay = 0 }: GradeGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // 반원
  const offset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isVisible) return;
    const duration = 1200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, score]);

  return (
    <div className={`
      bg-surface rounded-2xl border border-border p-4 text-center
      shadow-xs
      transition-all duration-500 ease-out
      ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
    `}>
      {/* 라벨 */}
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {label[0]}
        </span>
        <span className="text-xs font-bold text-text">{label}</span>
      </div>

      {/* 반원 게이지 */}
      <div className="relative mx-auto" style={{ width: size, height: size / 2 + 10 }}>
        <svg
          width={size}
          height={size / 2 + strokeWidth}
          viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}
          className="overflow-visible"
        >
          {/* 배경 트랙 */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke="#F0DED8"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* 진행 바 */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
          />
        </svg>
        {/* 점수 */}
        <div className="absolute inset-0 flex items-end justify-center pb-0">
          <span className="text-2xl font-black" style={{ color }}>
            {animatedScore}
          </span>
        </div>
      </div>

      {/* 설명 */}
      <p className="text-[10px] text-dim mt-1">{description}</p>
    </div>
  );
}
