'use client';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** 딥링크 + Android 뒤로가기 초기화. cleanup 함수를 반환합니다. */
export function initDeepLinks(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  // URL로 앱이 열렸을 때
  const urlListener = App.addListener('appUrlOpen', (event) => {
    console.log('[deeplink] URL:', event.url);
    try {
      const url = new URL(event.url);
      const path = url.pathname + url.search;
      if (path) {
        window.location.href = path;
      }
    } catch {
      // 잘못된 URL 무시
    }
  });

  // Android 뒤로가기 버튼
  const backListener = App.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  return () => {
    urlListener.then(h => h.remove());
    backListener.then(h => h.remove());
  };
}
