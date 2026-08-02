/**
 * OrangeRefine 맞춤법 교정 규칙 — 타입 정의
 * rules-1.ts ~ rules-4.ts 로 분리된 CORRECTION_RULES 데이터가 공통으로 참조.
 */

export interface CorrectionRule {
  /** find: RegExp */
  f: RegExp;
  /** to: 수정문 (string 또는 replace 콜백) */
  t: string | ((...args: string[]) => string);
  /** reason: 근거 설명 */
  r: string;
  /** category: 분류 (맞춤법/띄어쓰기/외래어 등) */
  c: string;
}
