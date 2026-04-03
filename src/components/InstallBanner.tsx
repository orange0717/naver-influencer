'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    // 이미 설치된 PWA이면 숨기기
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Capacitor 네이티브 앱이면 숨기기
    if (navigator.userAgent.includes('Capacitor')) return;
    // 이전에 닫았으면 3일간 숨기기
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 3 * 24 * 60 * 60 * 1000) return;

    // 플랫폼 감지
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    if (ios) setPlatform('ios');
    else if (android) setPlatform('android');
    else setPlatform('desktop');

    setShowBanner(true);

    // Chrome/Edge: beforeinstallprompt 이벤트 캡처
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
    localStorage.setItem('pwa-banner-dismissed', String(Date.now()));
  };

  if (!showBanner) return null;

  // 플랫폼별 안내
  const guide = platform === 'ios'
    ? <>공유 <svg className="inline align-text-bottom" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></svg> &gt; 홈 화면에 추가</>
    : platform === 'android'
    ? <>메뉴 &gt; 홈 화면에 추가</>
    : <>주소창 오른쪽 설치 아이콘을 눌러주세요</>;

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="relative bg-surface border border-accent/30 rounded-xl sm:rounded-2xl px-3.5 py-3 sm:p-5 shadow-sm">
        {/* 닫기 */}
        <button
          onClick={handleDismiss}
          className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-6 h-6 flex items-center justify-center text-dim hover:text-text transition cursor-pointer"
          aria-label="닫기"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* 로고 */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-header flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0">
            N
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <p className="font-bold text-text text-[13px] sm:text-sm">N인플 앱 설치</p>
            <p className="text-[11px] sm:text-xs text-dim leading-snug mt-0.5">{guide}</p>
          </div>

          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-accent text-white text-[11px] sm:text-xs font-bold rounded-lg hover:bg-accent-hover transition shrink-0 cursor-pointer"
            >
              설치
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
