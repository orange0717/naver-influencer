/**
 * AI 브리핑 · AI 탭 "종합 인용 상태" 단일 소스
 * ──────────────────────────────────────────────────────────────────────────
 * 표면별 상태(briefingStatus / tabStatus)를 하나의 종합 상태로 합친다.
 * 페이지 목록 / CSV / 대시보드 집계가 **모두 이 헬퍼**를 통해서만 상태를 계산해
 * 어느 화면에서든 숫자·라벨이 일치하도록 한다.
 *
 * ⚠️ 정직성 원칙:
 *   - 화면에서 실제로 "없음"을 확인한 경우(NOT_CITED)에만 미인용이다.
 *     타임아웃·접근제한·마크업 변경·중단은 전부 미인용이 아니다.
 *   - 두 표면은 서로 독립이다. 브리핑이 확인됐다고 탭 결과를 대신 쓰지 않는다.
 *     종합 상태는 표시 편의를 위한 요약일 뿐이고, 표면별 상태는 항상 따로 보여준다.
 */

/** 엔진이 내는 표면 단위 상태(naver-ai-briefing.ts의 SurfaceStatus와 동일 값). */
export type SurfaceStatusValue = 'CITED' | 'NOT_CITED' | 'UNVERIFIED' | 'UNAVAILABLE' | 'ERROR';

export type CitationState =
  | 'cited'        // 인용됨    — 브리핑·탭 모두 인용
  | 'partial'      // 일부 인용 — 한쪽만 인용(다른 쪽은 미인용이거나 확인 실패)
  | 'not_cited'    // 미인용    — 양쪽 다 화면에서 "없음"을 확인
  | 'pending'      // 확인 전   — 아직 확인 시도조차 없음
  | 'checking'     // 확인중    — 확인 진행 중
  | 'unverified'   // 미확인    — 확인을 시도했으나 판정에 필요한 정보를 얻지 못함
  | 'unavailable'  // 확인불가  — 접근 제한·캡차·점검 등 네이버 측 제약
  | 'error';       // 오류      — 브라우저 실패·마크업 변경 등 수정이 필요한 실패

export const CITATION_STATUS_LABELS: Record<CitationState, string> = {
  cited: '인용됨',
  partial: '일부 인용',
  not_cited: '미인용',
  pending: '확인 전',
  checking: '확인중',
  unverified: '미확인',
  unavailable: '확인불가',
  error: '오류',
};

/** 각 상태가 왜 그렇게 됐는지 — 배지 title/툴팁용 설명. */
export const CITATION_STATUS_DESCRIPTIONS: Record<CitationState, string> = {
  cited: 'AI 브리핑과 AI 탭 출처 목록 양쪽에서 이 게시글을 확인했습니다.',
  partial: 'AI 브리핑·AI 탭 중 한쪽에서만 이 게시글을 확인했습니다.',
  not_cited: '두 영역의 출처 목록을 끝까지 확인했고 이 게시글이 없었습니다.',
  pending: '아직 확인한 적이 없습니다.',
  checking: '지금 네이버 화면을 확인하는 중입니다.',
  unverified: '확인을 시도했지만 판정에 필요한 정보를 얻지 못했습니다. 미인용이 아닙니다.',
  unavailable: '네이버 접근 제한 등으로 확인할 수 없었습니다. 미인용이 아닙니다.',
  error: '확인 중 오류가 발생했습니다. 미인용이 아닙니다.',
};

/** 표면 단위 상태 라벨 — 브리핑/탭을 각각 표시할 때 사용(스펙 §2·§14). */
export const SURFACE_STATUS_LABELS: Record<SurfaceStatusValue, string> = {
  CITED: '인용됨',
  NOT_CITED: '미인용',
  UNVERIFIED: '미확인',
  UNAVAILABLE: '확인불가',
  ERROR: '오류',
};

/** 상태 필터 UI에서 쓰는 표준 필터 키. */
export type CitationFilter = 'all' | 'cited' | 'partial' | 'not_cited' | 'pending' | 'unresolved';

export const CITATION_FILTER_OPTIONS: { key: CitationFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'cited', label: '인용됨' },
  { key: 'partial', label: '일부 인용' },
  { key: 'not_cited', label: '미인용' },
  { key: 'pending', label: '확인 전' },
  { key: 'unresolved', label: '미확인·확인불가·오류' },
];

export type CheckStatusValue = 'ok' | 'partial' | 'transient_error' | 'unanalyzable' | null | undefined;

export interface CitationStatusInput {
  /** AI 브리핑 표면 상태 — 있으면 이 값이 진실이다. */
  briefingStatus?: SurfaceStatusValue | null;
  /** AI 탭 표면 상태 — 있으면 이 값이 진실이다. */
  tabStatus?: SurfaceStatusValue | null;
  /** AI 브리핑 인용 여부(레거시 평면 필드) */
  exposed?: boolean | null;
  /** AI 탭 인용 여부(레거시 평면 필드) */
  tabExposed?: boolean | null;
  /** 마지막 확인 시도 결과 분류(ai_briefing_exposures.check_status) */
  checkStatus?: CheckStatusValue;
  /** 마지막 성공 확인 시각 — check_status가 없던 레거시 행 판별용 */
  checkedAt?: string | null;
  /** 확인 진행 시작 시각 — 값이 있으면 확인중 */
  checkingStartedAt?: string | null;
  /** 지금 확인 진행 중(클라이언트 UI 전용) — true면 무조건 'checking' */
  checking?: boolean;
}

/** 확인이 끝까지 진행돼 인용/미인용을 단정할 수 있는 표면 상태인지. */
export function isVerifiedSurface(s: SurfaceStatusValue | null | undefined): boolean {
  return s === 'CITED' || s === 'NOT_CITED';
}

/**
 * 판정 불가 표면들 중 "가장 알려야 할" 상태 하나를 고른다.
 * 오류 > 확인불가 > 미확인 순 — 사용자가 조치할 수 있는 정보부터 노출한다.
 */
function worstUnresolved(states: (SurfaceStatusValue | null | undefined)[]): CitationState {
  if (states.includes('ERROR')) return 'error';
  if (states.includes('UNAVAILABLE')) return 'unavailable';
  if (states.includes('UNVERIFIED')) return 'unverified';
  return 'pending';
}

/**
 * 단일 (post, keyword) 결과의 종합 인용 상태를 계산한다.
 * 우선순위: checking > (표면 상태 기반 판정) > 레거시 폴백.
 */
export function computeCitationStatus(input: CitationStatusInput): CitationState {
  if (input.checking || input.checkingStartedAt) return 'checking';

  const b = input.briefingStatus ?? null;
  const t = input.tabStatus ?? null;

  if (b || t) {
    const bCited = b === 'CITED';
    const tCited = t === 'CITED';
    if (bCited && tCited) return 'cited';
    // 한쪽이 실제로 인용된 것은 다른 쪽 확인 실패와 무관하게 확정 사실이다.
    if (bCited || tCited) return 'partial';
    if (b === 'NOT_CITED' && t === 'NOT_CITED') return 'not_cited';
    return worstUnresolved([b, t]);
  }

  // ── 레거시 폴백(표면 상태가 없는 구 데이터) ──────────────────────────
  // 구 엔진은 확인 실패도 exposed=false로 저장했으므로 여기서 미인용을 단정하지 않는다.
  if (input.checkStatus === 'transient_error') return 'unverified';
  if (input.checkStatus === 'unanalyzable') return 'unavailable';
  if (!input.checkedAt && input.checkStatus == null) return 'pending';
  if (input.exposed === true || input.tabExposed === true) {
    return input.exposed === true && input.tabExposed === true ? 'cited' : 'partial';
  }
  return 'unverified';
}

/** 하나라도 인용(브리핑 or 탭)이면 true — 인용률 분자 판정에 사용. */
export function isCitedState(state: CitationState): boolean {
  return state === 'cited' || state === 'partial';
}

/** 인용률 분모에 포함되는 "확인 완료" 상태인지 — 확인 전/중/미확인/확인불가/오류는 제외. */
export function isCountedState(state: CitationState): boolean {
  return state === 'cited' || state === 'partial' || state === 'not_cited';
}

/** 재확인이 필요한 상태인지(스펙 §7) — 배치 재개 대상 판별에 사용. */
export function needsRecheck(state: CitationState): boolean {
  return state === 'pending' || state === 'unverified' || state === 'unavailable' || state === 'error';
}

/**
 * 한 포스팅에 여러 키워드 결과가 있을 때의 **포스팅 단위** 종합 상태.
 *  - 표면별로 "확정된 결과"만 모아 인용/일부/미인용을 판정한다.
 *  - 확정된 결과가 하나도 없으면 오류 > 확인불가 > 미확인 > 확인 전 순으로 알린다.
 */
export function rollupPostCitationStatus(results: CitationStatusInput[]): CitationState {
  if (results.length === 0) return 'pending';

  const states = results.map(r => computeCitationStatus(r));
  if (states.some(s => s === 'cited')) return states.every(s => s === 'cited') ? 'cited' : 'partial';
  if (states.some(s => s === 'partial')) return 'partial';
  if (states.some(s => s === 'not_cited')) return 'not_cited';
  if (states.some(s => s === 'checking')) return 'checking';
  if (states.some(s => s === 'error')) return 'error';
  if (states.some(s => s === 'unavailable')) return 'unavailable';
  if (states.some(s => s === 'unverified')) return 'unverified';
  return 'pending';
}

/** 종합 상태 배지 색상 토큰(테마 색). */
export function citationStatusColor(state: CitationState): 'up' | 'gold' | 'dim' | 'accent' | 'down' {
  switch (state) {
    case 'cited': return 'up';
    case 'partial': return 'gold';
    case 'checking': return 'accent';
    case 'unavailable': return 'gold';
    case 'error': return 'down';
    default: return 'dim'; // not_cited / pending / unverified
  }
}

/** 표면 상태 배지 색상 토큰. */
export function surfaceStatusColor(s: SurfaceStatusValue): 'up' | 'gold' | 'dim' | 'down' {
  switch (s) {
    case 'CITED': return 'up';
    case 'NOT_CITED': return 'dim';
    case 'UNAVAILABLE': return 'gold';
    case 'ERROR': return 'down';
    default: return 'dim'; // UNVERIFIED
  }
}
