/**
 * §20/§21 정확도 측정 — 사람이 확인한 실제 노출(ground truth)과 시스템 판정(overall_status)을 대조.
 *
 * 탐지 대상(positive class) = "미노출". 이 기능에서 가장 중요한 지표는
 * **False Positive = 실제 노출인데 미노출로 판정** 이며, 이를 최우선으로 최소화한다(§21).
 *
 * recheck/checking/error/unanalyzable 처럼 아직 확정되지 않은 판정은 정확도 분모에서 제외하고
 * '미결정'으로 따로 센다(확정 안 한 걸 틀렸다고 하지 않기 위함).
 */

export interface LabeledCase {
  postId: string;
  postTitle?: string | null;
  /** 사람이 네이버에서 직접 확인한 실제 노출 여부 */
  actualExposed: boolean;
  /** 시스템 최종 판정 overall_status (없으면 미검사) */
  overallStatus: string | null;
}

export interface AccuracyMetrics {
  labeledTotal: number;   // 라벨이 있는 포스트 수
  decided: number;        // 판정이 노출/미노출로 확정된 수(정확도 분모)
  undecided: number;      // recheck/checking/error/미검사 등
  tp: number;             // 미노출 판정 & 실제 미노출 (정탐)
  fp: number;             // 미노출 판정 & 실제 노출  (오탐 ★최우선)
  fn: number;             // 노출 판정 & 실제 미노출  (미탐)
  tn: number;             // 노출 판정 & 실제 노출
  precision: number | null;  // TP/(TP+FP)
  recall: number | null;     // TP/(TP+FN)
  accuracy: number | null;   // (TP+TN)/decided
  /** 실제 노출인데 미노출로 잘못 판정한 케이스(가장 중요 — 로직 수정 대상) */
  falsePositiveCases: { postId: string; postTitle?: string | null }[];
  /** 실제 미노출인데 노출로 판정한 케이스 */
  falseNegativeCases: { postId: string; postTitle?: string | null }[];
}

export function computeAccuracy(cases: LabeledCase[]): AccuracyMetrics {
  let tp = 0, fp = 0, fn = 0, tn = 0, undecided = 0;
  const falsePositiveCases: { postId: string; postTitle?: string | null }[] = [];
  const falseNegativeCases: { postId: string; postTitle?: string | null }[] = [];

  for (const c of cases) {
    const predictedMissing = c.overallStatus === 'missing';
    const predictedExposed = c.overallStatus === 'exposed';
    if (!predictedMissing && !predictedExposed) { undecided++; continue; }

    const actualMissing = c.actualExposed === false;
    if (predictedMissing && actualMissing) tp++;
    else if (predictedMissing && !actualMissing) { fp++; falsePositiveCases.push({ postId: c.postId, postTitle: c.postTitle }); }
    else if (predictedExposed && actualMissing) { fn++; falseNegativeCases.push({ postId: c.postId, postTitle: c.postTitle }); }
    else tn++;
  }

  const decided = tp + fp + fn + tn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const accuracy = decided > 0 ? (tp + tn) / decided : null;

  return {
    labeledTotal: cases.length,
    decided,
    undecided,
    tp, fp, fn, tn,
    precision, recall, accuracy,
    falsePositiveCases,
    falseNegativeCases,
  };
}
