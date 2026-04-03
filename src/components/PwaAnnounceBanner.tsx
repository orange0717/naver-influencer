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
    ? 'Safari에서 공유 버튼 → "홈 화면에 추가"를 눌러주세요'
    : platform === 'android'
    ? '브라우저 메뉴 → "홈 화면에 추가"를 눌러주세요'
    : '주소창 오른쪽의 설치 아이콘을 클릭하세요';

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#FDF6F3] via-white to-[#F5E6E0] border border-accent/20 rounded-2xl shadow-sm">
        {/* 닫기 버튼 */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-dim hover:text-text transition-colors cursor-pointer"
          aria-label="닫기"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 sm:gap-5 p-3.5 sm:p-6 pr-9 sm:pr-10">
          {/* 앱 아이콘 */}
          <div className="shrink-0">
            <div className="relative w-12 h-12 sm:w-[88px] sm:h-[88px]">
              <div className="w-full h-full rounded-xl sm:rounded-[22px] bg-header shadow-lg flex items-center justify-center">
                <span className="text-white font-extrabold text-lg sm:text-3xl">N</span>
              </div>
              <div className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-accent text-white text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-px sm:py-0.5 rounded-full shadow-sm">
                NEW
              </div>
            </div>
          </div>

          {/* 텍스트 */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold text-accent tracking-wide mb-0.5 sm:mb-1.5">APP LAUNCH</p>
            <h3 className="text-[13px] sm:text-lg font-extrabold text-text leading-snug mb-0.5 sm:mb-1.5">
              N인플 앱이 출시되었습니다
            </h3>
            <p className="text-[11px] sm:text-sm text-dim leading-relaxed mb-2 sm:mb-3">
              홈 화면에 추가하면 앱처럼 빠르게 접속할 수 있습니다.
            </p>

            {/* 설치 가이드 + 버튼 */}
            {deferredPrompt ? (
              <button
                onClick={handleInstall}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-5 sm:py-2.5 bg-accent text-white text-[11px] sm:text-sm font-bold rounded-full hover:bg-accent-hover transition-colors shadow-sm cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="sm:w-3.5 sm:h-3.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                앱 설치하기
              </button>
            ) : (
              <p className="text-[10px] sm:text-xs text-dim bg-black/[0.03] rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 inline-block">
                {platform === 'ios' && (
                  <span className="inline-flex items-center gap-1">
                    <svg className="inline shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                    </svg>
                    {guideText}
                  </span>
                )}
                {platform !== 'ios' && guideText}
              </p>
            )}
          </div>
        </div>

        {/* 하단 기능 태그 */}
        <div className="border-t border-accent/10 bg-accent/[0.03] px-3.5 sm:px-6 py-2 sm:py-3 flex flex-wrap gap-1.5 sm:gap-2">
          {['빠른 실행', '오프라인 지원', '푸시 알림', '홈 화면 아이콘'].map(tag => (
            <span key={tag} className="text-[9px] sm:text-[11px] text-accent/80 bg-accent/8 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
