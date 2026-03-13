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
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      className={`
        bg-surface rounded-2xl border border-border
        shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        ${hover ? 'hover:border-accent/30 hover:shadow-[0_4px_12px_rgba(204,148,134,0.12)] transition-all duration-300 ease-out' : ''}
        ${gradient ? 'bg-gradient-to-br from-surface to-accent/[0.03]' : ''}
        ${paddings[padding]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
}
