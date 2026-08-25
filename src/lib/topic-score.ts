/**
 * 대표 토픽 선정 점수 (curate-blog-topics 크론이 사용).
 *
 * 가중치: 포스팅수 25% · 최근활동 20% · 통합검색 15% · 블로그탭 15% · AI브리핑 10% · AI탭 5% · 챌린지TOP3 10%
 * (오렌지 제안서의 "포스팅 수/최근 활동/검색 성과/AI 브리핑 인용/AI 탭 노출/키워드챌린지 활동" 기준)
 *
 * ─── 왜 별도 파일인가 (2026-08-25) ────────────────────────────────────────────
 * 원래 크론 라우트 안에 인라인으로 있었다. 아래 '미측정' 규칙은 눈으로 봐서는 맞는지 알 수 없어서
 * (토픽 여러 개의 상대 정규화 결과를 비교해야 한다) 테스트를 붙일 수 있게 순수 함수로 뺐다.
 *
 * ─── 핵심 규칙: 측정 안 된 항목은 0점이 아니라 '제외'다 ──────────────────────
 * 이전 구현은 값이 없으면 0점을 줬다:
 *   - AI 브리핑/탭: ai_briefing_exposures 에 행이 없는 글(=아직 확인 안 함)은 그냥 안 세어져서 0
 *   - 평균순위: normalizeLowerIsBetter(null) → 0  (lowerIsBetter 에서 0 은 '최악')
 * 즉 "측정해보니 성과가 없었다"와 "아직 측정을 안 했다"가 같은 점수를 받았다.
 * 그 결과 확인이 끝난 토픽이 아직 확인 안 된 토픽을 대표 자리에서 밀어낼 수 있었다 —
 * 실제 성과 차이가 아니라 단지 확인 순서 때문에.
 *
 * 그래서 값이 null 인 항목은 분자·분모 양쪽에서 뺀다. 남은 항목의 가중치 합으로 나누므로
 * 점수는 항상 0~100 스케일을 유지하고 토픽 간 비교가 가능하다.
 */

/** 가중치 — 합이 1이 되도록 유지할 것. */
export const TOPIC_SCORE_WEIGHTS = {
  postCount: 0.25,
  recency: 0.20,
  integratedRank: 0.15,
  blogRank: 0.15,
  aiBriefing: 0.10,
  aiTab: 0.05,
  challengeTop3: 0.10,
} as const;

export interface TopicMetrics {
  postCount: number;
  /** 마지막 글 이후 경과일. 발행일을 아는 글이 하나도 없으면 null(미측정). */
  daysSinceLastPost: number | null;
  /** 순위 기록이 없으면 null(미측정). */
  avgIntegratedRank: number | null;
  avgBlogRank: number | null;
  /** AI 브리핑에 인용된 글 수. aiCheckedCount 가 0이면 이 값은 의미 없다. */
  aiBriefingCount: number;
  aiTabCount: number;
  /**
   * 이 토픽의 글 중 AI 인용 여부를 '실제로 확인한' 글 수.
   * 0 이면 aiBriefingCount·aiTabCount 는 '0건'이 아니라 '미확인'이다 → 점수에서 제외.
   */
  aiCheckedCount: number;
  challengeTop3Count: number;
}

interface Range {
  min: number;
  max: number;
}

function rangeOf(values: (number | null)[]): Range {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...known), max: Math.max(...known) };
}

/** 클수록 좋은 지표를 0~100 으로. 전부 같은 값이면(max<=min) 비교 정보가 없으므로 만점 취급하지 않고 0으로 둔다. */
function higherIsBetter(value: number, { min, max }: Range): number {
  if (max <= min) return value > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/** 작을수록 좋은 지표(순위)를 0~100 으로. */
function lowerIsBetter(value: number, { min, max }: Range): number {
  if (max <= min) return 100;
  return Math.max(0, Math.min(100, ((max - value) / (max - min)) * 100));
}

/**
 * 토픽 목록 전체를 받아 각 토픽의 점수를 매긴다.
 * 정규화가 토픽 간 상대값이라 한 건씩은 계산할 수 없다 — 반드시 전체를 함께 넘겨야 한다.
 *
 * @returns 입력과 같은 순서의 0~100 점수 배열. 소수 둘째 자리까지.
 */
export function scoreTopics(metrics: TopicMetrics[]): number[] {
  if (metrics.length === 0) return [];

  // AI 지표는 '확인한 글이 1건이라도 있는' 토픽만 값이 있는 것으로 본다.
  const briefingValue = (m: TopicMetrics) => (m.aiCheckedCount > 0 ? m.aiBriefingCount : null);
  const tabValue = (m: TopicMetrics) => (m.aiCheckedCount > 0 ? m.aiTabCount : null);

  const postRange = rangeOf(metrics.map(m => m.postCount));
  const recencyRange = rangeOf(metrics.map(m => m.daysSinceLastPost));
  const intRange = rangeOf(metrics.map(m => m.avgIntegratedRank));
  const blogRange = rangeOf(metrics.map(m => m.avgBlogRank));
  const briefingRange = rangeOf(metrics.map(briefingValue));
  const tabRange = rangeOf(metrics.map(tabValue));
  const top3Range = rangeOf(metrics.map(m => m.challengeTop3Count));

  return metrics.map(m => {
    // [가중치, 0~100 점수 또는 null(미측정)]
    const dims: [number, number | null][] = [
      [TOPIC_SCORE_WEIGHTS.postCount, higherIsBetter(m.postCount, postRange)],
      [TOPIC_SCORE_WEIGHTS.recency, m.daysSinceLastPost === null ? null : lowerIsBetter(m.daysSinceLastPost, recencyRange)],
      [TOPIC_SCORE_WEIGHTS.integratedRank, m.avgIntegratedRank === null ? null : lowerIsBetter(m.avgIntegratedRank, intRange)],
      [TOPIC_SCORE_WEIGHTS.blogRank, m.avgBlogRank === null ? null : lowerIsBetter(m.avgBlogRank, blogRange)],
      [TOPIC_SCORE_WEIGHTS.aiBriefing, briefingValue(m) === null ? null : higherIsBetter(m.aiBriefingCount, briefingRange)],
      [TOPIC_SCORE_WEIGHTS.aiTab, tabValue(m) === null ? null : higherIsBetter(m.aiTabCount, tabRange)],
      [TOPIC_SCORE_WEIGHTS.challengeTop3, higherIsBetter(m.challengeTop3Count, top3Range)],
    ];

    let weighted = 0;
    let weightSum = 0;
    for (const [w, v] of dims) {
      if (v === null) continue; // 미측정 — 0점을 주는 대신 분모에서도 뺀다
      weighted += w * v;
      weightSum += w;
    }
    // 측정된 항목이 하나도 없을 수는 없다(postCount·challengeTop3 는 항상 값이 있다). 방어적으로만 처리.
    if (weightSum === 0) return 0;
    return Math.round((weighted / weightSum) * 100) / 100;
  });
}
