/**
 * voter-fingerprint.ts
 * 비회원 투표자 식별용 브라우저 UUID 생성/관리
 *
 * - localStorage에 voter_uuid를 저장하여 같은 브라우저에서는 같은 ID 사용
 * - 서버측에서는 추가로 IP를 조합해 중복 투표 방지 (defense-in-depth)
 */

const STORAGE_KEY = 'voter_uuid';

/** 클라이언트 측 투표자 fingerprint 조회/생성 */
export function getVoterFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    let uuid = localStorage.getItem(STORAGE_KEY);
    if (!uuid) {
      uuid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : generateFallbackUuid();
      localStorage.setItem(STORAGE_KEY, uuid);
    }
    return uuid;
  } catch {
    // Private mode 등으로 localStorage가 막히면 세션 단위 UUID
    return generateFallbackUuid();
  }
}

function generateFallbackUuid(): string {
  // 간단한 UUIDv4 대체 (crypto.randomUUID 미지원 브라우저 대비)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 서버 측에서 fingerprint 형식 검증 */
export function isValidFingerprint(fp: unknown): fp is string {
  return typeof fp === 'string' && fp.length >= 8 && fp.length <= 128 && /^[a-z0-9\-]+$/i.test(fp);
}
