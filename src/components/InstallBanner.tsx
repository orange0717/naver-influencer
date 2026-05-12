'use client';

import { useState, useEffect } from 'react';
import { isDesktop } from '@/lib/desktop';

/**
 * PWA 앱 설치 유도 배너
 * - beforeinstallprompt 이벤트 감지 시 표시
 * - iOS Safari는 수동 안내
 * - 이미 설치된 경우 표시하지 않음
 * - Electron 데스크탑 앱에서는 표시하지 않음
 */
export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // 데스크탑 앱(Electron) 사용자는 이미 설치한 상태이므로 PWA 설치 유도 불필요
    if (isDesktop()) {
      setIsInstalled(true);
      return;
    }
    // 이미 설치된 앱이면 표시하지 않음
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // dismiss 상태 확인
    const wasDismissed = sessionStorage.getItem('install-banner-dismiss');
    if (wasDismissed) return;
    setDismissed(false);

    // iOS 감지
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isiOS);

    // Android/Chrome: beforeinstallprompt 이벤트
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isInstalled || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDismissed(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('install-banner-dismiss', '1');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="bg-surface border border-border rounded-2xl shadow-lg px-5 py-4 flex items-center gap-4">
        {/* 아이콘 */}
        <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <span className="text-accent font-bold text-lg">N</span>
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text">N인플 앱 설치</p>
          <p className="text-xs text-dim mt-0.5">
            {isIOS
              ? '공유 버튼 → 홈 화면에 추가를 눌러주세요'
              : '주소창 오른쪽 설치 아이콘을 눌러주세요'}
          </p>
        </div>

        {/* 설치 버튼 (Android/Chrome) */}
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="shrink-0 px-4 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent/90 transition-colors"
          >
            설치
          </button>
        )}

        {/* 닫기 */}
        <button
          onClick={handleDismiss}
          className="shrink-0 w-7 h-7 rounded-full hover:bg-bg flex items-center justify-center text-dim hover:text-text transition-colors cursor-pointer"
          aria-label="닫기"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// beforeinstallprompt 타입
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
