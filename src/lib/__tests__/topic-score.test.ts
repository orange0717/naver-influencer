import { describe, it, expect } from 'vitest';
import { scoreTopics, TOPIC_SCORE_WEIGHTS, type TopicMetrics } from '../topic-score';

/**
 * 대표 토픽 점수 회귀 테스트.
 *
 * 배경(2026-08-25): ai_briefing_exposures 는 "확인한 글"만 행이 생긴다. 그런데 집계는
 * `if (briefing?.exposed) aiBriefingCount++` 로만 세어서, 아직 확인 안 한 글이 조용히 0으로 합쳐졌다.
 * 그 0이 화면에 "AI 브리핑 0건"으로 나갔고, 더 나쁘게는 대표 토픽 점수에 10%/5% 가중치로 들어갔다.
 * 결과적으로 **성과가 나빠서가 아니라 아직 확인이 안 끝났다는 이유로** 대표 토픽 자리를 잃을 수 있었다.
 *
 * 여기서 지키려는 불변식:
 *   1) 미측정 항목은 0점이 아니라 가중치에서 제외한다(분자·분모 양쪽).
 *   2) 그래서 미확인 토픽과 확인 후 0건인 토픽은 **다른** 점수를 받는다.
 *   3) 전 항목이 측정된 경우의 점수는 예전 계산과 같아야 한다(가중치 합=1이므로 스케일 불변).
 */

function metric(over: Partial<TopicMetrics> = {}): TopicMetrics {
  return {
    postCount: 10,
    daysSinceLastPost: 5,
    avgIntegratedRank: 10,
    avgBlogRank: 10,
    aiBriefingCount: 0,
    aiTabCount: 0,
    aiCheckedCount: 5,
    challengeTop3Count: 0,
    ...over,
  };
}

describe('scoreTopics — 미측정과 0건 구분', () => {
  it('가중치 합은 1이다 — 아니면 전 항목 측정 시 스케일이 깨진다', () => {
    const sum = Object.values(TOPIC_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('↓핵심: 미확인 토픽이 "확인했는데 0건"인 토픽보다 낮은 점수를 받지 않는다', () => {
    // 두 토픽은 AI 지표를 뺀 나머지가 완전히 동일하다.
    // A: 5건 확인했고 인용은 0건 (= 측정된 나쁜 성과)
    // B: 아직 한 건도 확인 안 함 (= 미측정)
    // C: 5건 확인, 인용 5건 (정규화 상한을 만들기 위한 비교군)
    const [a, b] = scoreTopics([
      metric({ aiCheckedCount: 5, aiBriefingCount: 0, aiTabCount: 0 }),
      metric({ aiCheckedCount: 0, aiBriefingCount: 0, aiTabCount: 0 }),
      metric({ aiCheckedCount: 5, aiBriefingCount: 5, aiTabCount: 5 }),
    ]);
    // 예전 구현에서는 a === b 였다(둘 다 AI 항목 0점). 그게 버그였다.
    expect(b).toBeGreaterThan(a);
  });

  it('미확인 토픽의 점수는 AI 항목을 뺀 나머지만으로 계산된다', () => {
    // 단일 토픽이면 모든 정규화가 max<=min 경계로 떨어져 계산이 결정적이다.
    // postCount=10>0 → 100, challengeTop3=0 → 0, 순위/최근활동은 lowerIsBetter 경계 → 100.
    const [only] = scoreTopics([metric({ aiCheckedCount: 0, challengeTop3Count: 0 })]);
    const w = TOPIC_SCORE_WEIGHTS;
    const weighted = w.postCount * 100 + w.recency * 100 + w.integratedRank * 100 + w.blogRank * 100 + w.challengeTop3 * 0;
    const weightSum = w.postCount + w.recency + w.integratedRank + w.blogRank + w.challengeTop3;
    expect(only).toBeCloseTo(Math.round((weighted / weightSum) * 100) / 100, 2);
  });

  it('AI 확인이 1건이라도 있으면 인용 0건은 그대로 0점으로 반영된다 — 측정된 나쁜 성과는 숨기지 않는다', () => {
    const [low, high] = scoreTopics([
      metric({ aiCheckedCount: 3, aiBriefingCount: 0, aiTabCount: 0 }),
      metric({ aiCheckedCount: 3, aiBriefingCount: 3, aiTabCount: 3 }),
    ]);
    expect(low).toBeLessThan(high);
  });
});

describe('scoreTopics — 순위·최근활동 미측정', () => {
  it('순위 기록이 없는 토픽을 "순위 최하위"로 취급하지 않는다', () => {
    // A: 평균 50위(측정됨, 나쁨) · B: 순위 기록 없음(미측정) · C: 평균 1위(비교군)
    const [a, b] = scoreTopics([
      metric({ avgIntegratedRank: 50, avgBlogRank: 50 }),
      metric({ avgIntegratedRank: null, avgBlogRank: null }),
      metric({ avgIntegratedRank: 1, avgBlogRank: 1 }),
    ]);
    // 예전 normalizeLowerIsBetter(null)은 0(최악)을 돌려줬다 → b <= a 였다.
    expect(b).toBeGreaterThan(a);
  });

  it('발행일을 아는 글이 없으면(daysSinceLastPost=null) 최근활동 항목을 제외한다 — 가짜 3650일을 쓰지 않는다', () => {
    const [stale, unknown] = scoreTopics([
      metric({ daysSinceLastPost: 3650 }),
      metric({ daysSinceLastPost: null }),
      metric({ daysSinceLastPost: 1 }),
    ]);
    expect(unknown).toBeGreaterThan(stale);
  });
});

describe('scoreTopics — 기존 동작 보존', () => {
  it('전 항목이 측정되면 가중합 그대로다(분모=1) — 예전 계산과 값이 같다', () => {
    const metrics: TopicMetrics[] = [
      metric({ postCount: 0, daysSinceLastPost: 100, avgIntegratedRank: 30, avgBlogRank: 30, aiBriefingCount: 0, aiTabCount: 0, aiCheckedCount: 1, challengeTop3Count: 0 }),
      metric({ postCount: 20, daysSinceLastPost: 1, avgIntegratedRank: 2, avgBlogRank: 2, aiBriefingCount: 8, aiTabCount: 4, aiCheckedCount: 20, challengeTop3Count: 3 }),
    ];
    const [worst, best] = scoreTopics(metrics);
    // 모든 항목에서 각각 최하/최상이므로 정규화 결과는 0과 100, 가중치 합이 1이니 점수도 0과 100.
    expect(worst).toBe(0);
    expect(best).toBe(100);
  });

  it('빈 입력은 빈 배열', () => {
    expect(scoreTopics([])).toEqual([]);
  });

  it('점수는 항상 0~100 안에 있다 — 분모 축소가 스케일을 넘기지 않는지', () => {
    const metrics: TopicMetrics[] = [
      metric({ aiCheckedCount: 0, avgIntegratedRank: null, avgBlogRank: null, daysSinceLastPost: null }),
      metric({ postCount: 99, aiCheckedCount: 30, aiBriefingCount: 30, aiTabCount: 30, challengeTop3Count: 9 }),
      metric({ postCount: 0, challengeTop3Count: 0, aiCheckedCount: 1 }),
    ];
    for (const s of scoreTopics(metrics)) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});
