/**
 * OrangeRefine 맞춤법 교정 엔진
 * - 정규식 규칙 적용 (applyCorrections)
 * - AI/규칙 결과 병합 (mergeMatches) — 겹침 시 Claude 우선
 * - 역순 replace 로 원문 적용 (applyFixes)
 *
 * 원본: orangerefine/spellcheck/index.html:552-671
 */

import type { CorrectionRule } from './rules';

export interface Match {
  start: number;
  end: number;
  word: string;
  fix: string;
  reason: string;
  category: string;
  /** 'rule' = 정규식 규칙, 'claude' = AI 검출 */
  source: 'rule' | 'claude';
  /** Claude stage (1=교정, 2=교열) */
  stage?: 1 | 2;
}

/**
 * CORRECTION_RULES 를 순회하며 text 에서 매치 추출
 * 원본: spellcheck/index.html:587-614
 */
export function applyCorrections(text: string, rules: CorrectionRule[]): Match[] {
  const matches: Match[] = [];

  for (const rule of rules) {
    if (!rule.f || !rule.t) continue;
    const re = new RegExp(rule.f.source, rule.f.flags);
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
      let fix: string;
      try {
        if (typeof rule.t === 'function') {
          fix = m[0].replace(new RegExp(rule.f.source), rule.t as never);
        } else {
          fix = m[0].replace(new RegExp(rule.f.source), rule.t);
        }
      } catch {
        fix = typeof rule.t === 'string' ? rule.t : m[0];
      }

      if (fix !== m[0]) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          word: m[0],
          fix,
          reason: rule.r || '',
          category: rule.c || '',
          source: 'rule',
        });
      }
      if (!rule.f.flags.includes('g')) break;
      // 무한 루프 방지: 빈 매치일 경우 1 전진
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  return matches;
}

/**
 * 규칙 결과와 Claude 결과 병합
 * 겹침 시 Claude 우선 (source === 'claude')
 * 원본: spellcheck/index.html:552-573
 */
export function mergeMatches(ruleMatches: Match[], aiMatches: Match[]): Match[] {
  const all = [...ruleMatches, ...aiMatches];
  all.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: Match[] = [];

  for (const m of all) {
    const conflictIdx = merged.findIndex((x) => !(m.end <= x.start || m.start >= x.end));

    if (conflictIdx === -1) {
      merged.push(m);
    } else if (m.source === 'claude' && merged[conflictIdx].source !== 'claude') {
      merged[conflictIdx] = m;
    }
    // 그 외(둘 다 규칙 또는 둘 다 Claude) → 먼저 들어온 것 유지
  }

  merged.sort((a, b) => a.start - b.start);
  return merged;
}

/**
 * 원문에 모든 수정안 역순으로 적용 (인덱스 밀림 방지)
 * 원본: spellcheck/index.html:429-441
 */
export function applyFixes(text: string, matches: Match[]): string {
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  let result = text;
  for (const m of sorted) {
    result = result.substring(0, m.start) + m.fix + result.substring(m.end);
  }
  return result;
}

/**
 * Claude Worker 응답(`corrections` 배열)을 Match[] 로 변환
 * corrections: [{original, corrected, reason, category, position}]
 */
export function claudeResponseToMatches(
  text: string,
  corrections: Array<{
    original?: string;
    corrected?: string;
    reason?: string;
    category?: string;
    position?: number;
  }>,
  stage: 1 | 2,
): Match[] {
  const matches: Match[] = [];
  if (!Array.isArray(corrections)) return matches;

  for (const c of corrections) {
    if (!c?.original || typeof c.corrected !== 'string') continue;
    if (c.original === c.corrected) continue;

    // position 이 숫자면 먼저 그 위치에서 확인, 아니면 처음부터 찾기
    let idx = -1;
    if (typeof c.position === 'number' && c.position >= 0) {
      const slice = text.substring(c.position, c.position + c.original.length);
      if (slice === c.original) idx = c.position;
    }
    if (idx === -1) idx = text.indexOf(c.original);
    if (idx === -1) continue;

    matches.push({
      start: idx,
      end: idx + c.original.length,
      word: c.original,
      fix: c.corrected,
      reason: (c.reason || '') + (stage === 2 ? ' (AI 교열)' : ' (AI 교정)'),
      category: c.category || (stage === 2 ? '문장품질' : '맞춤법'),
      source: 'claude',
      stage,
    });
  }

  return matches;
}
