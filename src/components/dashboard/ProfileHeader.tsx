'use client';

import { ReactNode, useRef, useState } from 'react';
import { formatCount, formatDate } from '@/lib/format';

interface ProfileHeaderProps {
  displayName: string;
  imageUrl?: string;
  category?: string;
  subscriberCount?: number;
  firstSeenAt?: string;
  blogId?: string;
  type: 'influencer' | 'blogger';
  subscribed?: boolean;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
  extraStats?: ReactNode;
  children?: ReactNode;
  editable?: boolean;
  onProfileChange?: (data: { displayName?: string; imageUrl?: string }) => void;
  top3Count?: number;
  totalKeywords?: number;
  myKeyword?: string;
  naverId?: string;
  isOfficialBlog?: boolean;
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
  subscriptionPlan,
  subscriptionExpiresAt,
  extraStats,
  children,
  editable = false,
  onProfileChange,
  top3Count,
  totalKeywords,
  myKeyword,
  naverId,
  isOfficialBlog,
}: ProfileHeaderProps) {
  const isInfluencer = type === 'influencer';

  // 닉네임 편집
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(displayName);

  // TOP3 위젯 코드 모달
  const [showWidgetCode, setShowWidgetCode] = useState(false);
  const widgetDomain = process.env.NEXT_PUBLIC_SITE_URL || 'https://ninfle.kr';

  // 프로필 사진 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('이미지 크기는 2MB 이하로 업로드해주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onProfileChange?.({ imageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleNameSave = () => {
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== displayName) {
      onProfileChange?.({ displayName: trimmed });
    }
    setEditingName(false);
  };

  return (
    <div className="bg-gradient-to-r from-surface via-surface to-accent/[0.05] rounded-2xl border border-border p-4 shadow-xs">
      <div className="flex items-center gap-3">
        {/* 프로필 이미지 */}
        <div className="relative group">
          {imageUrl ? (
            <div className={`relative w-11 h-11 rounded-full ring-2 ring-offset-2 ring-offset-surface ${isInfluencer ? 'ring-accent/30' : 'ring-[#2DB400]/30'}`}>
              <img src={imageUrl} alt={displayName} className="w-11 h-11 rounded-full object-cover" />
            </div>
          ) : (
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold ring-2 ring-offset-2 ring-offset-surface ${isInfluencer ? 'bg-accent/15 text-accent ring-accent/20' : 'bg-[#2DB400]/15 text-[#2DB400] ring-[#2DB400]/20'}`}>
              {displayName[0]}
            </div>
          )}
          {/* 사진 변경 오버레이 */}
          {editable && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="프로필 사진 변경"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </>
          )}
        </div>

        {/* 프로필 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
                  className="text-base font-extrabold bg-bg border border-accent rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/30 w-40"
                  autoFocus
                  maxLength={20}
                />
                <button onClick={handleNameSave} className="text-xs text-white bg-accent px-2.5 py-1 rounded-lg font-bold hover:bg-accent-hover transition cursor-pointer">저장</button>
                <button onClick={() => { setTempName(displayName); setEditingName(false); }} className="text-xs text-dim px-2 py-1 rounded-lg hover:bg-bg transition cursor-pointer">취소</button>
              </div>
            ) : (
              <>
                <h1 className="text-base font-extrabold truncate">{displayName}</h1>
                {editable && (
                  <button
                    onClick={() => { setTempName(displayName); setEditingName(true); }}
                    className="text-dim hover:text-accent transition cursor-pointer"
                    title="닉네임 변경"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                )}
              </>
            )}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isInfluencer
                ? 'text-accent bg-accent/10'
                : 'text-[#2DB400] bg-[#2DB400]/10'
            }`}>
              {isInfluencer ? '인플루언서' : '블로거'}
            </span>
            {isOfficialBlog && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-blue-600 bg-blue-500/10">
                공식블로그
              </span>
            )}
            {subscribed && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-accent bg-accent/10 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
                {subscriptionPlan === 'INFLUENCER' ? '인플루언서 구독중'
                  : subscriptionPlan === 'BLOGGER' ? '블로거 구독중'
                  : '구독중'}
                {subscriptionExpiresAt && (
                  <span className="text-accent/70 font-normal ml-0.5">
                    · ~{formatDate(subscriptionExpiresAt)}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {category && (
              <span className="text-xs text-dim flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                {category}
              </span>
            )}
            {myKeyword && (
              <span className="text-xs text-dim flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                {myKeyword}
              </span>
            )}
            {subscriberCount !== undefined && subscriberCount > 0 && (
              <span className="text-xs text-dim flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                팬 {formatCount(subscriberCount)}
              </span>
            )}
            {firstSeenAt && (
              <span className="text-xs text-dim flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                선정일 {formatDate(firstSeenAt)}
              </span>
            )}
            {blogId && (
              <a
                href={`https://blog.naver.com/${blogId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-dim hover:text-accent transition flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                blog.naver.com/{blogId}
              </a>
            )}
          </div>
        </div>

        {/* TOP3 달성률 위젯 */}
        {top3Count !== undefined && totalKeywords !== undefined && totalKeywords > 0 && (
          <button
            onClick={() => naverId && setShowWidgetCode(true)}
            className="ml-auto shrink-0 text-center bg-accent/[0.07] rounded-xl px-3 py-2 border border-accent/15 cursor-pointer hover:bg-accent/[0.12] transition"
            title="클릭하면 블로그 삽입 코드를 확인할 수 있습니다"
          >
            <p className="stat-title text-accent mb-0.5">TOP 3 달성률</p>
            <p className="stat-value stat-value-kpi text-accent leading-none">
              {Math.round((top3Count / totalKeywords) * 100)}<span className="text-xs font-bold">%</span>
            </p>
            <p className="stat-desc">{top3Count}/{totalKeywords}개</p>
          </button>
        )}
      </div>

      {/* TOP3 위젯 HTML 코드 모달 */}
      {showWidgetCode && naverId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowWidgetCode(false)}>
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-lg w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">TOP 3 달성률 위젯</h3>
              <button onClick={() => setShowWidgetCode(false)} className="text-dim hover:text-text transition cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* 미리보기 */}
            <div className="flex justify-center py-2">
              <img
                src={`/api/widget/top3/${naverId}`}
                alt="TOP3 달성률 위젯"
                width={170}
                className="rounded-lg"
              />
            </div>

            {/* HTML 코드 */}
            <div>
              <p className="text-xs text-dim font-semibold mb-2">아래 코드를 블로그에 붙여넣으세요</p>
              <div className="relative">
                <textarea
                  readOnly
                  value={`<a href="${widgetDomain}/influencers/${naverId}" target="_blank" rel="noopener"><img src="${widgetDomain}/api/widget/top3/${naverId}" alt="N인플 TOP3 달성률" width="170" /></a>`}
                  className="w-full h-20 text-xs bg-bg border border-border rounded-xl p-3 font-mono resize-none focus:outline-none"
                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                />
                <button
                  onClick={() => {
                    const code = `<a href="${widgetDomain}/influencers/${naverId}" target="_blank" rel="noopener"><img src="${widgetDomain}/api/widget/top3/${naverId}" alt="N인플 TOP3 달성률" width="170" /></a>`;
                    navigator.clipboard.writeText(code);
                  }}
                  className="absolute top-2 right-2 text-[10px] font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg hover:bg-accent/20 transition cursor-pointer"
                >
                  복사
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 추가 스탯 또는 자식 요소 */}
      {(extraStats || children) && (
        <div className="mt-4 pt-4 border-t border-border/50">
          {extraStats || children}
        </div>
      )}
    </div>
  );
}
