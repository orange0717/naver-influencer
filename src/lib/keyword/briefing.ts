/**
 * "오늘의 브리핑"이 비어 있을 때 무엇을 말할지 고른다.
 *
 * 예전엔 변동이 0이면 섹션이 통째로 사라졌다. 그러면 사용자 입장에서
 *   ① 순위가 정말 그대로인 것
 *   ② 아직 아무것도 확인되지 않은 것
 *   ③ 오늘 처음 측정돼서 비교할 어제가 없는 것
 * 이 셋이 전부 "화면에 아무것도 없음"으로 똑같이 보인다. 셋은 완전히 다른 상태다.
 *
 * 우리가 아는 것만 말하고, 모르는 것은 단정하지 않는다.
 */

export type BriefingEmptyKind = 'nothing-tracked' | 'no-baseline' | 'no-change';

export interface BriefingEmptyReason {
  kind: BriefingEmptyKind;
  title: string;
  detail: string;
}

export function briefingEmptyReason(
  trackedCount: number,
  comparableCount: number,
): BriefingEmptyReason {
  // 순위 데이터가 아예 없다 = 아직 확인하지 않은 상태. "변동 없음"이 아니다.
  if (trackedCount <= 0) {
    return {
      kind: 'nothing-tracked',
      title: '아직 확인된 순위가 없습니다',
      detail: '키워드 순위가 수집되면 매일 아침 변동을 정리해 보여드립니다.',
    };
  }

  // 순위는 있는데 비교할 이전 값이 없다 = 첫 측정.
  if (comparableCount <= 0) {
    return {
      kind: 'no-baseline',
      title: '비교할 이전 순위가 아직 없습니다',
      detail: `${trackedCount}개 키워드의 순위를 처음 기록했습니다. 다음 수집부터 변동을 비교해 보여드립니다.`,
    };
  }

  // 확인했고, 비교했고, 진짜로 그대로다.
  return {
    kind: 'no-change',
    title: '순위 변동이 없습니다',
    detail: `${comparableCount}개 키워드를 이전 순위와 비교했고, 오르내린 키워드가 없습니다.`,
  };
}
