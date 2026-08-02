/**
 * OrangeRefine 맞춤법 교정 규칙 (CORRECTION_RULES)
 * 원본: orangerefine/js/rules.js (v3.0)
 *
 * 국립국어원 한글 맞춤법·표준어 규정·외래어 표기법 기반 1,600+개 규칙
 * N인플 프로젝트로 이식 — 수정 시 원본과 동기화 필요
 *
 * 파일이 너무 커서(1,600+줄) rules-1.ts ~ rules-4.ts 로 원본 순서 그대로 4등분.
 * 규칙은 순서대로 적용되므로(engine.ts applyCorrections) 분할/재조합 시
 * 원본과 정확히 같은 순서를 유지해야 함.
 */

import type { CorrectionRule } from './rule-types';
import { RULES_PART1 } from './rules-1';
import { RULES_PART2 } from './rules-2';
import { RULES_PART3 } from './rules-3';
import { RULES_PART4 } from './rules-4';

export type { CorrectionRule };

export const CORRECTION_RULES: CorrectionRule[] = [
  ...RULES_PART1,
  ...RULES_PART2,
  ...RULES_PART3,
  ...RULES_PART4,
];
