'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaAnnounceBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    // 이미 설치된 PWA이면 숨기기
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Capacitor 네이티브 앱이면 숨기기
    if (navigator.userAgent.includes('Capacitor')) return;
    // 이전에 닫았으면 7일간 숨기기
    const dismissed = localStorage.getItem('pwa-announce-dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    if (ios) setPlatform('ios');
    else if (android) setPlatform('android');
    else setPlatform('desktop');

    setShowBanner(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowBanner(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-announce-dismissed', String(Date.now()));
  };

  if (!showBanner) return null;

  const guideText = platform === 'ios'
    ? '공유 버튼 > 홈 화면에 추가'
    : platform === 'android'
    ? '메뉴 > 홈 화면에 추가'
    : '주소창 오른쪽 설치 아이콘 클릭';

  return (
    <div className="relative bg-gradient-to-r from-accent/[0.08] to-accent/[0.03] border-b border-accent/15">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 pr-10">
        {/* 공지 뱃지 */}
        <span className="shrink-0 text-[11px] font-bold text-white bg-accent px-2.5 py-0.5 rounded-full">
          공지
        </span>

        {/* 메시지 */}
        <p className="flex-1 text-sm text-text truncate">
          N인플 앱이 출시되었습니다! 홈 화면에 추가하면 앱처럼 빠르게 접속할 수 있습니다.
        </p>

        {/* 설치 CTA */}
        {deferredPrompt ? (
          <button
            onClick={handleInstall}
            className="shrink-0 text-xs font-bold text-accent hover:underline whitespace-nowrap cursor-pointer"
          >
            설치하기
          </button>
        ) : (
          <span className="shrink-0 text-[11px] text-dim whitespace-nowrap hidden sm:block">
            {guideText}
          </span>
        )}
      </div>

      {/* 닫기 */}
      <button
        onClick={handleDismiss}
        className="absolute top-1/2 -translate-y-1/2 right-2 w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-dim hover:text-text transition-colors cursor-pointer"
        aria-label="배너 닫기"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
