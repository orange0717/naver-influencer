/**
 * AI 브리핑 · AI 탭 "종합 인용 상태" 단일 소스 (스펙 #5/#18/#27)
 * ──────────────────────────────────────────────────────────────────────────
 * AI 브리핑 결과(exposed)와 AI 탭 결과(tab_exposed)를 하나의 종합 상태로 합친다.
 * 페이지 목록 / CSV / 대시보드 집계가 **모두 이 헬퍼**를 통해서만 상태를 계산해
 * 어느 화면에서든 숫자·라벨이 일치하도록 한다.
 *
 * ⚠️ 정직성 원칙(스펙 #18/#27):
 *   - API 오류(transient_error)·구조적 분석불가(unanalyzable)·미확인을 절대 "미인용(not_cited)"으로
 *     계산하지 않는다. 각각 failed/unsupported/unchecked 로 분리한다.
 *   - "인용"은 실제 인용(exposed===true / tab_exposed===true)일 때만.
 */

export type CitationState =
  | 'cited'        // 인용      — 브리핑·탭 모두 인용
  | 'partial'      // 일부 인용 — 브리핑·탭 중 하나만 인용
  | 'not_cited'    // 미인용    — 확인 완료했으나 어디에도 인용 안 됨
  | 'unchecked'    // 미확인    — 아직 확인한 적 없음
  | 'checking'     // 확인중    — 지금 확인 진행 중(클라이언트 일시 상태)
  | 'failed'       // 확인실패  — 네이버 접근 제한 등 일시적 오류
  | 'unsupported'; // 지원안함  — 구조적으로 분석 불가(예: 대표키워드 없음)

export const CITATION_STATUS_LABELS: Record<CitationState, string> = {
  cited: '인용',
  partial: '일부 인용',
  not_cited: '미인용',
  unchecked: '미확인',
  checking: '확인중',
  failed: '확인실패',
  unsupported: '지원안함',
};

/** 상태 필터 UI(스펙 #17)에서 쓰는 표준 필터 키(전체 + 6종). */
export type CitationFilter = 'all' | 'cited' | 'partial' | 'not_cited' | 'unchecked' | 'failed';

export const CITATION_FILTER_OPTIONS: { key: CitationFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'cited', label: '인용' },
  { key: 'partial', label: '일부 인용' },
  { key: 'not_cited', label: '미인용' },
  { key: 'unchecked', label: '미확인' },
  { key: 'failed', label: '확인실패' },
];

export type CheckStatusValue = 'ok' | 'transient_error' | 'unanalyzable' | null | undefined;

export interface CitationStatusInput {
  /** AI 브리핑 인용 여부 */
  exposed?: boolean | null;
  /** AI 탭 인용 여부 */
  tabExposed?: boolean | null;
  /** 마지막 확인 시도 결과 분류(ai_briefing_exposures.check_status) */
  checkStatus?: CheckStatusValue;
  /** 마지막 성공 확인 시각 — check_status가 없던 레거시 행 판별용 */
  checkedAt?: string | null;
  /** 지금 확인 진행 중(클라이언트 UI 전용) — true면 무조건 'checking' */
  checking?: boolean;
}

/**
 * 단일 (post, keyword) 결과의 종합 인용 상태를 계산한다.
 * 우선순위: checking > 오류/분석불가 > 미확인 > (인용 판정).
 */
export function computeCitationStatus(input: CitationStatusInput): CitationState {
  if (input.checking) return 'checking';

  if (input.checkStatus === 'transient_error') return 'failed';
  if (input.checkStatus === 'unanalyzable') return 'unsupported';

  // 확인된 적 없음: check_status='ok'도 아니고 checked_at도 없음 → 미확인
  const wasChecked = input.checkStatus === 'ok' || !!input.checkedAt;
  if (!wasChecked) return 'unchecked';

  const briefingCited = input.exposed === true;
  const tabCited = input.tabExposed === true;
  if (briefingCited && tabCited) return 'cited';
  if (briefingCited || tabCited) return 'partial';
  return 'not_cited';
}

/** 하나라도 인용(브리핑 or 탭)이면 true — 인용률(스펙 #23) 분자 판정에 사용. */
export function isCitedState(state: CitationState): boolean {
  return state === 'cited' || state === 'partial';
}

/** 인용률(스펙 #23) 분모에 포함되는 "확인 완료" 상태인지 — 미확인/확인실패/지원안함/확인중은 제외. */
export function isCountedState(state: CitationState): boolean {
  return state === 'cited' || state === 'partial' || state === 'not_cited';
}

/**
 * 한 포스팅에 여러 키워드 결과가 있을 때의 **포스팅 단위** 종합 상태(스펙 #18).
 * 대시보드가 post_id distinct로 세는 방식과 동일하게 맞춘다:
 *  - 확인 완료(check_status='ok')된 결과가 하나라도 있으면 그것들만으로 인용/일부/미인용 판정
 *    (브리핑 인용 = ok 결과 중 exposed===true 존재, 탭 인용 = tab_exposed===true 존재).
 *  - ok 결과가 하나도 없으면: 오류가 있으면 failed, 분석불가만 있으면 unsupported, 아무 시도 없으면 unchecked.
 */
export function rollupPostCitationStatus(results: CitationStatusInput[]): CitationState {
  if (results.length === 0) return 'unchecked';

  const okResults = results.filter(r => r.checkStatus === 'ok' || (!!r.checkedAt && r.checkStatus == null));
  if (okResults.length > 0) {
    const briefingCited = okResults.some(r => r.exposed === true);
    const tabCited = okResults.some(r => r.tabExposed === true);
    if (briefingCited && tabCited) return 'cited';
    if (briefingCited || tabCited) return 'partial';
    return 'not_cited';
  }

  if (results.some(r => r.checkStatus === 'transient_error')) return 'failed';
  if (results.some(r => r.checkStatus === 'unanalyzable')) return 'unsupported';
  return 'unchecked';
}

/** 종합 상태 배지 색상 토큰(테마 색). up=인용, gold=일부/확인실패, dim=미인용/미확인, accent=확인중. */
export function citationStatusColor(state: CitationState): 'up' | 'gold' | 'dim' | 'accent' {
  switch (state) {
    case 'cited': return 'up';
    case 'partial': return 'gold';
    case 'checking': return 'accent';
    case 'failed': return 'gold';
    default: return 'dim'; // not_cited / unchecked / unsupported
  }
}
