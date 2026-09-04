/**
 * 골든셋 — 사람이 확인한 실제 노출 여부(ground truth)와, 그때의 판정 입력값을 함께 고정한 회귀 픽스처.
 *
 * 판정 "결과"를 박아두지 않고 "입력"을 박아두는 이유: 결과를 저장하면 그건 과거 코드의 답을 다시
 * 읽는 것뿐이라 상태머신이 바뀌어도 테스트가 통과한다. 입력을 저장하고 매번 computeVerdict 를
 * 다시 돌려야 판정 로직 변경이 정확도를 떨어뜨리는 순간을 잡을 수 있다.
 *
 * 🚨 용어가 두 갈래라 반드시 확인할 것:
 *   지시서 "거짓 노출"   = 시스템이 '노출'이라 했는데 실제로는 미노출  → computeAccuracy 의 fn
 *   지시서 "거짓 미노출" = 시스템이 '미노출'이라 했는데 실제로는 노출  → computeAccuracy 의 fp
 * exposure-accuracy.ts 주석은 fp(거짓 미노출)를 최우선으로 적었고, 작업 지시서는 fn(거짓 노출)을
 * 0건으로 못박았다. 아래 목표치는 지시서를 정본으로 삼는다.
 */

import { computeVerdict, type VerdictInput, type AreaExposed } from './exposure-verdict';
import { computeAccuracy, type AccuracyMetrics } from './exposure-accuracy';

export interface GoldenCase {
  postId: string;
  postTitle?: string | null;
  /** 사람이 네이버에서 직접 확인한 실제 노출 여부 */
  actualExposed: boolean;
  /** 경계 케이스의 성격 메모(예: "인플루언서탭만 노출", "발행 3시간 뒤 검사") */
  note?: string | null;
  /** 판정 재현용 입력 — 이 값으로 computeVerdict 를 다시 돌려 채점한다 */
  input: VerdictInput;
}

export interface GoldenFixture {
  cases: GoldenCase[];
}

/**
 * 저장된 검사 결과(post_missing_checks 행)를 판정 입력으로 되돌린다.
 * status 는 DB 에 'failed' 같은 값도 들어오므로 상태머신이 아는 세 가지로 좁힌다 —
 * 모르는 값을 'ok' 로 흘려보내면 실패한 검사가 미노출로 굳는다(§6 첫 번째 금지).
 */
export function toVerdictInput(src: {
  view: AreaExposed;
  blog: AreaExposed;
  inf: AreaExposed;
  status?: string | null;
  inIndexingGrace?: boolean;
  consecutiveMissing?: number | null;
}): VerdictInput {
  const status: VerdictInput['status'] =
    src.status === 'unanalyzable' ? 'unanalyzable'
    : src.status === 'ok' || src.status == null ? 'ok'
    : 'error';
  return {
    view: src.view, blog: src.blog, inf: src.inf,
    status,
    inIndexingGrace: src.inIndexingGrace ?? false,
    consecutiveMissing: src.consecutiveMissing ?? 0,
  };
}

/** 픽스처를 매번 다시 판정해 정확도 지표를 낸다. */
export function scoreGolden(cases: GoldenCase[]): AccuracyMetrics {
  return computeAccuracy(cases.map(c => ({
    postId: c.postId,
    postTitle: c.postTitle,
    actualExposed: c.actualExposed,
    overallStatus: computeVerdict(c.input).verdict,
  })));
}

/** 지시서 §4.2 목표치 */
export const ACCURACY_TARGETS = {
  /** 최소 골든셋 규모 — 노출 10 / 미노출 10 / 경계 10 */
  minCases: 30,
  /** 확정 판정 중 정답 비율 */
  accuracyMin: 0.95,
  /** 거짓 노출(fn) 허용 건수 — 0건, 비율이 아니라 절대 건수다 */
  falseExposedMax: 0,
  /** 거짓 미노출(fp) 허용 비율 — 확정 판정 대비 */
  falseMissingRateMax: 0.03,
  /** 확인 불가(미확정) 허용 비율 — 라벨 전체 대비 */
  undecidedRateMax: 0.05,
} as const;

export interface TargetCheck {
  label: string;
  value: number;
  limit: number;
  pass: boolean;
}

/**
 * 지표를 §4.2 목표와 대조한다. 분모가 서로 다르다:
 *   정확도·거짓 미노출률 → decided(확정 판정 건수)
 *   확인 불가율          → labeledTotal(라벨 전체)
 */
export function evaluateTargets(m: AccuracyMetrics): TargetCheck[] {
  const decided = m.decided || 0;
  const total = m.labeledTotal || 0;
  return [
    { label: '정확도', value: m.accuracy ?? 0, limit: ACCURACY_TARGETS.accuracyMin, pass: (m.accuracy ?? 0) >= ACCURACY_TARGETS.accuracyMin },
    { label: '거짓 노출(건)', value: m.fn, limit: ACCURACY_TARGETS.falseExposedMax, pass: m.fn <= ACCURACY_TARGETS.falseExposedMax },
    { label: '거짓 미노출률', value: decided > 0 ? m.fp / decided : 0, limit: ACCURACY_TARGETS.falseMissingRateMax, pass: (decided > 0 ? m.fp / decided : 0) <= ACCURACY_TARGETS.falseMissingRateMax },
    { label: '확인 불가율', value: total > 0 ? m.undecided / total : 0, limit: ACCURACY_TARGETS.undecidedRateMax, pass: (total > 0 ? m.undecided / total : 0) <= ACCURACY_TARGETS.undecidedRateMax },
  ];
}

/** 골든셋 구성(노출/미노출/경계) 분포 — 30건 요건이 한쪽으로 쏠렸는지 본다. */
export function goldenComposition(cases: GoldenCase[]): { exposed: number; missing: number; boundary: number } {
  let exposed = 0, missing = 0, boundary = 0;
  for (const c of cases) {
    // 경계 = 판정이 노출/미노출로 확정되지 않는 입력(유예·재검증 대기·오류·분석 불가)
    const v = computeVerdict(c.input).verdict;
    if (v !== 'exposed' && v !== 'missing') boundary++;
    else if (c.actualExposed) exposed++;
    else missing++;
  }
  return { exposed, missing, boundary };
}
