'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getLatestUpdate, type UpdateItem } from '@/lib/update-data';
import { useAuth } from '@/hooks/useAuth';

/**
 * 업데이트 공지 배너
 * - 우선순위 1: 공지사항 중 show_on_banner = true 인 최신 1건 (/api/notices/banner)
 * - 우선순위 2: src/lib/update-data.ts 하드코딩 데이터
 * - localStorage 기반 dismiss (버전/ID 별, 브라우저 종료 후에도 유지)
 */
export default function UpdateBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<
    | { version: string; title: string; date: string; href?: string; changes: string[] }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let resolved: typeof item = null;

      try {
        const res = await fetch('/api/notices/banner', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json?.notice) {
            resolved = {
              version: `notice-${json.notice.id}`,
              title: json.notice.title,
              date: json.notice.date,
              href: json.notice.href,
              changes: [],
            };
          }
        }
      } catch {
        /* DB 조회 실패 시 아래 fallback 사용 */
      }

      if (!resolved) {
        const fallback: UpdateItem | null = getLatestUpdate();
        if (fallback) {
          resolved = {
            version: fallback.version,
            title: fallback.title,
            date: fallback.date,
            href: fallback.href,
            changes: fallback.changes,
          };
        }
      }

      if (cancelled || !resolved) return;

      setItem(resolved);
      const dismissed = localStorage.getItem(`update-dismiss-${resolved.version}`);
      if (!dismissed) setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!item || !visible) return null;

  const bannerHref =
    item.href && !user.id && item.href.startsWith('/notice')
      ? `/auth/login?redirect=${encodeURIComponent(item.href)}`
      : item.href;

  const handleDismiss = () => {
    localStorage.setItem(`update-dismiss-${item.version}`, '1');
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
          {item.title}
          <span className="ml-2 text-xs font-normal text-dim">{item.date}</span>
        </p>
        {item.changes.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {item.changes.map((change, i) => (
              <li key={i} className="text-xs text-dim before:content-['·'] before:mr-1 before:text-accent">
                {change}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* CTA */}
      {item.href && (
        <span className="shrink-0 text-xs font-bold text-accent whitespace-nowrap hidden sm:block">
          자세히 보기 →
        </span>
      )}
    </div>
  );

  return (
    <div className="relative bg-accent/[0.05] border-b border-accent/15">
      {bannerHref ? (
        <Link href={bannerHref} className="block hover:bg-accent/[0.05] transition-colors">
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
