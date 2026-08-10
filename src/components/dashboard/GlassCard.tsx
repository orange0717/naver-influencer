'use client';

import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  gradient?: boolean;
}

export default function GlassCard({
  children,
  className = '',
  hover = false,
  padding = 'md',
  gradient = false,
}: GlassCardProps) {
  // 8px 간격 시스템: sm=16px, md=24px, lg=32px
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={`
        bg-surface rounded-lg border border-border
        shadow-xs
        ${hover ? 'hover:border-accent/40 transition-colors duration-200 ease-out' : ''}
        ${gradient ? 'bg-accent/[0.03]' : ''}
        ${paddings[padding]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
}
