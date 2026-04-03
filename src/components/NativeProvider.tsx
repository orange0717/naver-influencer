'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function NativeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // 딥링크 + Android 뒤로가기 초기화 (로그인 여부 무관)
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;

      import('@/lib/deep-links').then(({ initDeepLinks }) => {
        cleanup = initDeepLinks();
      });

      // Status bar 스타일
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Light });
        StatusBar.setBackgroundColor({ color: '#E4C1B8' });
      }).catch(() => {});
    }).catch(() => {});

    return () => cleanup?.();
  }, []);

  // 푸시 알림 초기화 (로그인 시)
  useEffect(() => {
    if (!user.id) return;

    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;

      import('@/lib/push-notifications').then(({ initPushNotifications }) => {
        initPushNotifications();
      });
    }).catch(() => {});
  }, [user.id]);

  return <>{children}</>;
}
