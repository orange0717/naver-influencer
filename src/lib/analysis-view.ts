'use client';

/**
 * 무료 하루 3회 분석 화면 조회 제한 — 클라이언트 헬퍼.
 *
 * 화면(컴포넌트) mount 마다 view token 을 1개 발급해, 그 화면의 모든 데이터 요청에 같은 토큰을
 * 헤더로 실어 보낸다. 서버(withAnalysisView)는 같은 토큰의 하위 요청(필터/검색/정렬/페이지네이션)을
 * 한 번의 조회로 dedup 하고, 새 토큰(새로고침·새 탭·뒤로가기로 remount)만 새 조회로 카운트한다.
 */

export const VIEW_TOKEN_HEADER = 'X-View-Token';

/** 새 화면-조회 토큰 발급 (컴포넌트 mount 시 1회, useRef 로 고정해 사용) */
export function newViewToken(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* noop */
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/** 해당 화면 데이터 요청에 붙일 헤더 */
export function viewHeaders(token: string): Record<string, string> {
  return { [VIEW_TOKEN_HEADER]: token };
}

export interface QuotaInfo {
  used: number;
  limit: number;
  needsSignup: boolean;
}

/**
 * fetch 응답이 무료 조회 초과(402 quotaExceeded)인지 판별한다.
 * 초과면 QuotaInfo 를, 아니면 null 을 반환한다. (응답 본문을 소비하므로 초과가 아닐 땐 재사용 불가)
 */
export async function readQuotaExceeded(res: Response): Promise<QuotaInfo | null> {
  if (res.status !== 402) return null;
  try {
    const data = await res.clone().json();
    if (data?.quotaExceeded) {
      return {
        used: typeof data.used === 'number' ? data.used : 0,
        limit: typeof data.limit === 'number' ? data.limit : 3,
        needsSignup: !!data.needsSignup,
      };
    }
  } catch {
    /* noop */
  }
  return null;
}
