'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/** Capacitor 네이티브 앱에서 실행 중인지 확인 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** 플랫폼 반환 (ios/android/web) */
export function getNativePlatform(): 'ios' | 'android' | 'web' {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
}

/** 푸시 알림 초기화 - 로그인 후 1회 호출 */
export async function initPushNotifications(): Promise<void> {
  if (!isNativeApp()) return;

  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.log('[push] 권한 거부됨');
    return;
  }

  await PushNotifications.register();

  // 토큰 수신
  PushNotifications.addListener('registration', async (token) => {
    console.log('[push] 토큰 수신:', token.value.slice(0, 20) + '...');
    await registerPushToken(token.value);
  });

  // 등록 실패
  PushNotifications.addListener('registrationError', (error) => {
    console.error('[push] 등록 실패:', error);
  });

  // 포그라운드 알림 수신
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[push] 포그라운드 알림:', notification.title);
  });

  // 알림 탭 (백그라운드에서)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data;
    if (data?.url) {
      window.location.href = data.url;
    }
  });
}

/** 서버에 푸시 토큰 등록 */
async function registerPushToken(token: string): Promise<void> {
  const platform = getNativePlatform();

  try {
    const res = await fetch('/api/notifications/register-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
    });
    if (!res.ok) {
      console.error('[push] 토큰 등록 실패:', res.status);
    }
  } catch (err) {
    console.error('[push] 토큰 등록 에러:', err);
  }
}

/** 로그아웃 시 푸시 토큰 해제 */
export async function unregisterPushToken(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await fetch('/api/notifications/register-push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
  } catch {
    // 무시
  }
}
