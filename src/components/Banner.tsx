'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BannerItem } from '@/lib/banner-data';

interface BannerProps {
  banner: BannerItem;
  /** 배너 간 구분을 위한 고유 키 (sessionStorage dismiss) */
  dismissKey?: string;
}

/**
 * 재사용 가능한 배너 컴포넌트
 * - 텍스트 기반, N인플 디자인 시스템 준수
 * - sessionStorage 기반 닫기 (세션 동안 유지)
 */
export default function Banner({ banner, dismissKey }: BannerProps) {
  const storageKey = `banner-dismiss-${dismissKey || banner.id}`;
  const [dismissed, setDismissed] = useState(true); // 초기에 숨김 (hydration 방지)

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(storageKey);
    setDismissed(!!wasDismissed);
  }, [storageKey]);

  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  const gradientClass = banner.gradient || 'from-[#FDF6F3] to-[#F5E6E0]';

  const content = (
    <>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {banner.icon && (
          <span className="text-lg mt-0.5 shrink-0">{banner.icon}</span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {banner.badge && (
              <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {banner.badge}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-text leading-snug">{banner.title}</p>
          <p className="text-xs text-dim mt-1 leading-relaxed">{banner.description}</p>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2 mt-2 sm:mt-0">
        <span className="text-xs font-bold text-accent whitespace-nowrap">{banner.cta}</span>
      </div>
    </>
  );

  const wrapperClass = `relative bg-gradient-to-r ${gradientClass} rounded-xl border border-border/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 group transition-all hover:border-accent/30`;

  return (
    <div className="relative">
      {banner.external ? (
        <a href={banner.href} target="_blank" rel="noopener noreferrer" className={wrapperClass}>
          {content}
        </a>
      ) : (
        <Link href={banner.href} className={wrapperClass}>
          {content}
        </Link>
      )}

      {/* 닫기 버튼 */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(); }}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-dim hover:text-text transition-colors cursor-pointer"
        aria-label="배너 닫기"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
