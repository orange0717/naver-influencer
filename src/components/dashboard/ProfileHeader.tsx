'use client';

import { ReactNode } from 'react';

interface ProfileHeaderProps {
  displayName: string;
  imageUrl?: string;
  category?: string;
  subscriberCount?: number;
  firstSeenAt?: string;
  blogId?: string;
  type: 'influencer' | 'blogger';
  subscribed?: boolean;
  extraStats?: ReactNode;
  children?: ReactNode;
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}

export default function ProfileHeader({
  displayName,
  imageUrl,
  category,
  subscriberCount,
  firstSeenAt,
  blogId,
  type,
  subscribed = false,
  extraStats,
  children,
}: ProfileHeaderProps) {
  const isInfluencer = type === 'influencer';
  const accentColor = isInfluencer ? 'accent' : '[#2DB400]';

  return (
    <div className="bg-gradient-to-r from-surface via-surface to-accent/[0.05] rounded-2xl border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4">
        {/* 프로필 이미지 */}
        {imageUrl ? (
          <div className={`relative w-16 h-16 rounded-full ring-2 ring-${accentColor}/30 ring-offset-2 ring-offset-surface`}>
            <img src={imageUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
          </div>
        ) : (
          <div className={`w-16 h-16 bg-${accentColor}/15 rounded-full flex items-center justify-center text-${accentColor} text-2xl font-bold ring-2 ring-${accentColor}/20 ring-offset-2 ring-offset-surface`}>
            {displayName[0]}
          </div>
        )}

        {/* 프로필 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-extrabold truncate">{displayName}</h1>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isInfluencer
                ? 'text-accent bg-accent/10'
                : 'text-[#2DB400] bg-[#2DB400]/10'
            }`}>
              {isInfluencer ? '인플루언서' : '블로거'}
            </span>
            {subscribed && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-accent bg-accent/10 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
                구독중
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            {category && (
              <span className="text-sm text-dim flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                {category}
              </span>
            )}
            {subscriberCount !== undefined && subscriberCount > 0 && (
              <span className="text-sm text-dim flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                팬 {formatCount(subscriberCount)}
              </span>
            )}
            {firstSeenAt && (
              <span className="text-sm text-dim flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                선정일 {formatDate(firstSeenAt)}
              </span>
            )}
            {blogId && (
              <a
                href={`https://blog.naver.com/${blogId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-dim hover:text-accent transition flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                blog.naver.com/{blogId}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 추가 스탯 또는 자식 요소 */}
      {(extraStats || children) && (
        <div className="mt-4 pt-4 border-t border-border/50">
          {extraStats || children}
        </div>
      )}
    </div>
  );
}
