/**
 * ai-topic-guard.ts — N인플 AI 컨설턴트를 "마케팅 전용"으로 코드에서 강제하는 게이트.
 *
 * 시스템 프롬프트에 "마케팅 무관 질문은 거절"이라고 적어두는 것만으로는 탈옥(jailbreak)으로
 * 우회될 수 있어, 아래 두 겹으로 코드가 직접 범위를 강제한다.
 *
 *  1) isBlatantlyOffTopic(query) — LLM 호출 이전에 명백한 오프토픽/프롬프트 인젝션을
 *     결정론적으로 차단(무료 횟수도 소모하지 않음). 오탐을 줄이려 "확실한 것"만 잡는다(고정밀).
 *  2) route.ts 의 응답 스키마 onTopic 판정 — 미묘한 오프토픽(번역·일반상식·잡담 등)은
 *     모델이 onTopic=false 로 표시하고, 코드가 답변을 아래 안내문으로 교체한다.
 *
 * 두 경로 모두 사용자에게는 동일한 MARKETING_SCOPE_REFUSAL 안내문을 돌려준다.
 */

/** 오프토픽으로 판정됐을 때 사용자에게 돌려줄 정중한 안내문(코드가 강제로 사용). */
export const MARKETING_SCOPE_REFUSAL =
  '저는 N인플의 네이버 블로그·인플루언서 마케팅 전용 AI 컨설턴트예요. ' +
  '키워드·순위·미노출·콘텐츠 전략처럼 마케팅과 블로그 성장에 관한 고민을 도와드릴 수 있어요. ' +
  '관련된 질문으로 다시 물어봐 주시겠어요? (예: "요즘 블로그 방문자가 줄었는데 뭘 먼저 확인해야 할까요?")';

// ── 결정론적 하드 차단 패턴 ─────────────────────────────────────────────
// 마케팅 질문을 잘못 막지 않도록(오탐 최소화) "명백한 것"만 좁게 잡는다.
// 미묘한 경계는 여기서 잡지 말고 route.ts 의 onTopic 판정에 맡긴다.

// (1) 프롬프트 인젝션 / 시스템 지시 무력화 시도
const INJECTION_PATTERNS: RegExp[] = [
  /(이전|앞의?|위의?)\s*(지시|명령|규칙|프롬프트|설정)[^.\n]{0,8}(무시|잊|지워|삭제)/,
  /(너의?|당신의?)\s*(지시\s*사항|규칙|설정|프롬프트|시스템\s*프롬프트)[^.\n]{0,12}(무시|알려|보여|출력|말해|공개)/,
  /(시스템\s*프롬프트|system\s*prompt)/i,
  /ignore\s+(?:the\s+|all\s+|any\s+|previous\s+|above\s+|prior\s+|earlier\s+)*(?:instruction|prompt|rule|message|context)/i,
  /(역할|롤)[^.\n]{0,6}(무시|벗어나|잊)/,
  /(jailbreak|탈옥|prompt\s*injection)/i,
];

// (2) 프로그래밍/코드 작성 요청 — 마케팅 컨설턴트가 다룰 범위가 아님
const CODE_PATTERNS: RegExp[] = [
  /(코드|소스\s*코드|스크립트|함수|프로그램|알고리즘)[^.\n]{0,10}(짜|작성|만들|구현|고쳐|수정|디버그|짜줘|짜주)/,
  /(파이썬|python|자바스크립트|javascript|타입스크립트|typescript|\bjava\b|c\+\+|c#|리액트|react|sql\s*쿼리|엑셀\s*함수|정규식)[^.\n]{0,20}(짜|작성|만들|구현|코드|알려)/i,
  /(버그|에러|오류)[^.\n]{0,8}(고쳐|수정|디버그)/,
];

/**
 * LLM 호출 이전에 "명백히" 마케팅과 무관하거나 프롬프트 인젝션인 질문인지 판정한다.
 * true 면 호출부에서 OpenAI를 부르지 않고 즉시 MARKETING_SCOPE_REFUSAL 로 응답해야 한다.
 * 경계가 애매한 경우는 false 를 반환하고(통과), route.ts 의 onTopic 판정이 2차로 거른다.
 */
export function isBlatantlyOffTopic(query: string): boolean {
  const q = (query || '').trim();
  if (!q) return false;
  return (
    INJECTION_PATTERNS.some((re) => re.test(q)) ||
    CODE_PATTERNS.some((re) => re.test(q))
  );
}
