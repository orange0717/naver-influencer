/**
 * device-id.ts
 * 동시 로그인 기기 제한용 device fingerprint
 *
 * - localStorage + 1년 만료 쿠키에 동일 UUID 저장 → 미들웨어가 쿠키로 읽음
 * - 쿠키 이름: ni_device_id (httpOnly 아님 — 클라이언트 쓰기 필요)
 */

const STORAGE_KEY = 'ni_device_id';
const COOKIE_NAME = 'ni_device_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1년

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * 클라이언트에서 device-id 조회/생성.
 * - localStorage 우선, 없으면 쿠키, 둘 다 없으면 새로 생성
 * - 둘 모두에 동기화하여 쿠키로 서버 전달 가능
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id: string | null = null;
  try {
    id = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  if (!id) id = readCookie(COOKIE_NAME);
  if (!id) id = generateUuid();

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE_NAME, id);
  return id;
}

/** 서버에서 형식 검증 */
export function isValidDeviceId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 8 && id.length <= 128 && /^[a-z0-9\-]+$/i.test(id);
}

export const DEVICE_ID_COOKIE = COOKIE_NAME;
