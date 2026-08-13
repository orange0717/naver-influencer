/**
 * 미노출 교차검증 상태머신 (서버·클라이언트 공용 순수 로직).
 *
 * 이 파일은 네이버를 호출하지 않는다 — 이미 수집된 (통합검색/블로그/인플루언서) 영역별
 * 노출값을 받아 "최종 판정"과 "신뢰도"만 계산한다. 검색·크롤링은 keyword-rank-check.ts,
 * 오케스트레이션·영속화는 post-exposure-check.ts 가 담당한다(§23 관심사 분리).
 *
 * 핵심 원칙(§1·§10): 오탐(실제 노출인데 미노출로 판정) 최소화.
 *   - 어느 한 영역이라도 노출(true) → 무조건 '노출' (상태 A/B/C)
 *   - 검사한 모든 영역이 미노출(false) → 상태 D → 곧바로 확정하지 않고 재검증(§11)
 *   - 영역값이 null(미검사/오류) → "알 수 없음"으로 취급, 미노출 근거로 쓰지 않음(§15)
 */

export type AreaExposed = boolean | null;

/** 최종 판정값(§19 화면 상태 5종 + 내부 error/unanalyzable) */
export type ExposureVerdict =
  | 'exposed'       // 🟢 노출
  | 'missing'       // 🔴 미노출 (재검증으로 확정)
  | 'recheck'       // 🟡 재검사 (모든 영역 미노출 1회 — 재검증 대기)
  | 'checking'      // ⚪ 확인 중 (발행 직후 색인 유예 등)
  | 'error'         // ⚫ 확인 불가 (일시적 오류)
  | 'unanalyzable'; // 분석 대상 아님(비공개/검색어 생성 불가)

export type Confidence = 'high' | 'medium' | 'low';

/** 세 영역 노출값을 한 상태로 요약 (검사 결과 그 자체의 성격) */
export type RawAreaState = 'exposed' | 'all-missing' | 'unknown';

/**
 * §10 상태 A/B/C/D 판정의 1단계 — 영역값만 보고 원시 상태를 낸다.
 *   - exposed     : 하나라도 노출됨(A/B/C 전부 여기로 수렴)
 *   - all-missing : 검사된(=non-null) 영역이 1개 이상이고 그게 전부 false (상태 D 후보)
 *   - unknown     : 검사된 영역이 없음(전부 null)
 */
export function computeRawAreaState(view: AreaExposed, blog: AreaExposed, inf: AreaExposed): RawAreaState {
  if (view === true || blog === true || inf === true) return 'exposed';
  const checked = [view, blog, inf].filter(v => v !== null);
  if (checked.length > 0 && checked.every(v => v === false)) return 'all-missing';
  return 'unknown';
}

export interface VerdictInput {
  view: AreaExposed;
  blog: AreaExposed;
  inf: AreaExposed;
  /** 검색 파이프라인 상태: 정상('ok') / 일시적 오류('error') / 분석불가('unanalyzable') */
  status: 'ok' | 'error' | 'unanalyzable';
  /** 발행 후 색인 유예 기간 이내인가(§18) — true면 미노출 대신 '확인 중' */
  inIndexingGrace?: boolean;
  /**
   * "모든 영역 미노출"을 지금까지 연속으로 관측한 횟수(이번 검사 포함).
   * 1이면 아직 재검증 전 → 'recheck', 2 이상이면 'missing' 확정(§11).
   */
  consecutiveMissing: number;
}

export interface VerdictOutput {
  verdict: ExposureVerdict;
  confidence: Confidence | null;
  raw: RawAreaState;
}

/** missing 확정에 필요한 최소 연속 관측 횟수(§11 "2회 연속 동일") */
export const MISSING_CONFIRM_THRESHOLD = 2;

/**
 * §10 + §11 + §14 최종 판정.
 * consecutiveMissing 은 호출측이 (이전 저장값 + 이번 결과)로 계산해 넘긴다.
 */
export function computeVerdict(input: VerdictInput): VerdictOutput {
  const { view, blog, inf, status, inIndexingGrace, consecutiveMissing } = input;

  if (status === 'unanalyzable') return { verdict: 'unanalyzable', confidence: null, raw: 'unknown' };
  if (status === 'error') return { verdict: 'error', confidence: null, raw: 'unknown' };

  const raw = computeRawAreaState(view, blog, inf);

  // 상태 A/B/C: 한 영역이라도 노출 → 노출 확정. URL 매칭으로 확인된 직접 증거라 신뢰도 high.
  if (raw === 'exposed') return { verdict: 'exposed', confidence: 'high', raw };

  // 전부 null(검사된 영역 없음) → 아직 확인 중
  if (raw === 'unknown') return { verdict: 'checking', confidence: null, raw };

  // raw === 'all-missing' (상태 D)
  // 발행 직후 색인 유예 기간이면 미노출로 확정하지 않고 '확인 중'(§18)
  if (inIndexingGrace) return { verdict: 'checking', confidence: null, raw };

  // §11 재검증: 1회째는 재검사 대기, 2회 연속부터 미노출 확정
  if (consecutiveMissing < MISSING_CONFIRM_THRESHOLD) {
    return { verdict: 'recheck', confidence: null, raw };
  }
  return { verdict: 'missing', confidence: confidenceForMissing(consecutiveMissing), raw };
}

/**
 * §14 미노출 신뢰도 — 독립 관측이 많을수록 높다.
 *   HIGH   : 3회 이상 연속 동일(모든 영역 미노출)
 *   MEDIUM : 2회 연속 동일
 *   LOW    : 그 외(경계값)
 */
export function confidenceForMissing(consecutiveMissing: number): Confidence {
  if (consecutiveMissing >= 3) return 'high';
  if (consecutiveMissing >= MISSING_CONFIRM_THRESHOLD) return 'medium';
  return 'low';
}

/** §19 화면 표기(이모지 + 한글 라벨). error/unanalyzable 은 절대 미노출로 표기하지 않는다(§15). */
export function verdictLabel(verdict: ExposureVerdict): { emoji: string; text: string } {
  switch (verdict) {
    case 'exposed':      return { emoji: '🟢', text: '노출' };
    case 'missing':      return { emoji: '🔴', text: '미노출' };
    case 'recheck':      return { emoji: '🟡', text: '재검사' };
    case 'checking':     return { emoji: '⚪', text: '확인 중' };
    case 'error':        return { emoji: '⚫', text: '확인 불가' };
    case 'unanalyzable': return { emoji: '⚫', text: '분석 불가' };
  }
}

export function confidenceLabel(confidence: Confidence | null): string {
  switch (confidence) {
    case 'high':   return '높음';
    case 'medium': return '보통';
    case 'low':    return '낮음';
    default:       return '—';
  }
}
