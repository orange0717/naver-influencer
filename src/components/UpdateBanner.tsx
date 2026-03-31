'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getLatestUpdate } from '@/lib/update-data';

/**
 * 업데이트 공지 배너
 * - 최신 업데이트 1건만 표시
 * - localStorage 기반 dismiss (버전별, 브라우저 종료 후에도 유지)
 * - 새 버전 배포 시 자동으로 다시 표시
 */
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const update = getLatestUpdate();

  useEffect(() => {
    if (!update) return;
    const dismissed = localStorage.getItem(`update-dismiss-${update.version}`);
    if (!dismissed) setVisible(true);
  }, [update]);

  if (!update || !visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(`update-dismiss-${update.version}`, '1');
    setVisible(false);
  };

  const inner = (
    <div className="max-w-7xl mx-auto px-4 py-3 flex items-start sm:items-center gap-3">
      {/* 뱃지 */}
      <span className="shrink-0 text-[11px] font-bold text-white bg-accent px-2.5 py-0.5 rounded-full mt-0.5 sm:mt-0">
        UPDATE
      </span>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-text leading-snug">
          {update.title}
          <span className="ml-2 text-xs font-normal text-dim">{update.date}</span>
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {update.changes.map((change, i) => (
            <li key={i} className="text-xs text-dim before:content-['·'] before:mr-1 before:text-accent">
              {change}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      {update.href && (
        <span className="shrink-0 text-xs font-bold text-accent whitespace-nowrap hidden sm:block">
          자세히 보기 →
        </span>
      )}
    </div>
  );

  return (
    <div className="relative bg-gradient-to-r from-accent/[0.08] to-accent/[0.03] border-b border-accent/15">
      {update.href ? (
        <Link href={update.href} className="block hover:bg-accent/[0.05] transition-colors">
          {inner}
        </Link>
      ) : (
        inner
      )}

      {/* 닫기 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDismiss();
        }}
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
