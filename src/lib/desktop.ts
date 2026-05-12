/**
 * N인플 데스크탑 앱(Electron) 연동 헬퍼.
 *
 * 데스크탑 앱은 페이지에 `window.ninfl` 객체를 주입합니다.
 * 일반 브라우저에서는 정의되지 않으며, 함수들은 안전하게 폴백합니다.
 */

export type DesktopNotifyPayload = {
  title: string;
  body: string;
  /** true이면 소리 없이 표시 */
  silent?: boolean;
  /** true이면 critical (Linux 등에서 더 오래 유지) */
  urgent?: boolean;
};

type DesktopPlatform = 'darwin' | 'win32' | 'linux' | (string & {});

interface NinflDesktopBridge {
  isDesktop: true;
  platform: DesktopPlatform;
  notify: (p: DesktopNotifyPayload) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  getVersion: () => Promise<string>;
  setBadge: (count: number) => Promise<boolean>;
}

declare global {
  interface Window {
    ninfl?: NinflDesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.ninfl?.isDesktop;
}

export function getDesktopPlatform(): DesktopPlatform | null {
  if (!isDesktop()) return null;
  return window.ninfl!.platform;
}

/**
 * 알림 표시.
 * - 데스크탑 앱이면 네이티브 OS 알림 (DND, 알림센터에 누적)
 * - 일반 브라우저면 표준 Web Notification API (권한 필요)
 */
export async function notify(payload: DesktopNotifyPayload): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (isDesktop()) {
    try {
      return await window.ninfl!.notify(payload);
    } catch {
      return false;
    }
  }

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(payload.title, { body: payload.body, silent: !!payload.silent });
      return true;
    }
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification(payload.title, { body: payload.body, silent: !!payload.silent });
        return true;
      }
    }
  }
  return false;
}

/** 외부 URL을 시스템 기본 브라우저로 열기 (데스크탑 전용, 그 외엔 window.open 폴백) */
export async function openExternal(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isDesktop()) {
    try {
      return await window.ninfl!.openExternal(url);
    } catch {
      return false;
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** Dock(macOS)/오버레이(Windows) 배지 카운트 설정. 다른 환경에선 무시. */
export async function setBadge(count: number): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    return await window.ninfl!.setBadge(count);
  } catch {
    return false;
  }
}

/** 데스크탑 앱 버전 (없으면 null) */
export async function getDesktopVersion(): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    return await window.ninfl!.getVersion();
  } catch {
    return null;
  }
}
