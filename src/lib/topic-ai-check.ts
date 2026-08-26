/**
 * 토픽별 AI 인용 건수의 '확인 상태' 판정.
 *
 * 화면 컴포넌트 안에 두면 회귀 테스트를 붙일 수 없어서(이 저장소 vitest 는 node 환경이고
 * React Testing Library 가 없다) 순수 함수로 분리한다. topic-score.ts 와 같은 이유다.
 *
 * 이 파일이 지키는 규칙 하나:
 *   **확인하지 않은 것을 0건으로 표시하지 않는다.**
 * `ai_briefing_count` 는 "인용된 글 수"이고 `ai_checked_count` 는 "인용 여부를 실제로 확인한 글 수"다.
 * 확인한 글이 0이면 인용 건수 0 은 아무 의미가 없다 — 그때의 0 은 '인용 0건'이 아니라 '모름'이다.
 */

/** 'none' 아직 확인 안 함 · 'partial' 글 일부만 확인 · 'full' 토픽의 글을 전부 확인 */
export type AiCheckState = 'none' | 'partial' | 'full';

/**
 * @param checked 인용 여부를 확인한 글 수. null 은 DB에 ai_checked_count 컬럼이 없다는 뜻
 *                (마이그레이션 161 미적용) — 미확인과 같게 다룬다.
 * @param postCount 이 토픽에 속한 글 수.
 */
export function aiCheckState(checked: number | null | undefined, postCount: number): AiCheckState {
  if (!checked || checked <= 0) return 'none';
  return checked < postCount ? 'partial' : 'full';
}

/** 마우스를 올렸을 때의 설명. 전부 확인한 상태에서는 덧붙일 말이 없다. */
export function aiCheckTitle(
  checked: number | null | undefined,
  postCount: number,
  uncheckedTitle: string,
): string | undefined {
  const state = aiCheckState(checked, postCount);
  if (state === 'none') return uncheckedTitle;
  if (state === 'full') return undefined;
  const done = checked ?? 0;
  return `이 토픽의 글 ${postCount}개 중 ${done}개만 AI 인용 여부를 확인했습니다. 나머지 ${postCount - done}개는 아직 확인하지 않아 건수에 포함되지 않았습니다.`;
}

/**
 * 화면에 찍을 문자열.
 *  · 미확인      → '-'          (0 이 아니다)
 *  · 일부만 확인 → '0건 (3/50 확인)'
 *  · 전부 확인   → '0건'
 */
export function formatAiCount(
  count: number,
  checked: number | null | undefined,
  postCount: number,
  suffix = '',
): string {
  const state = aiCheckState(checked, postCount);
  if (state === 'none') return '-';
  if (state === 'partial') return `${count}${suffix} (${checked}/${postCount} 확인)`;
  return `${count}${suffix}`;
}
