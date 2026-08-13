import { describe, it, expect } from 'vitest';
import {
  computeRawAreaState,
  computeVerdict,
  confidenceForMissing,
  MISSING_CONFIRM_THRESHOLD,
} from '../exposure-verdict';

// §20 정확도 테스트 케이스 1~8을 상태머신 수준에서 검증한다.
// (테스트 6~8 "다른 사람 포스팅/제목변경 동일URL/동일제목 다른블로그"는 검색 계층의
//  blogId+postId URL 매칭이 담당 — 여기서는 그 결과가 상태머신에 어떻게 반영되는지만 검증한다.)

describe('computeRawAreaState (§10 A/B/C/D 1단계)', () => {
  it('하나라도 노출이면 exposed (상태 A/B/C 전부)', () => {
    expect(computeRawAreaState(true, true, true)).toBe('exposed');     // A
    expect(computeRawAreaState(true, true, false)).toBe('exposed');    // B
    expect(computeRawAreaState(false, true, false)).toBe('exposed');   // C ← 과거 OR 로직의 오탐 지점
    expect(computeRawAreaState(false, false, true)).toBe('exposed');   // 인플루언서만 노출
  });

  it('검사된 영역이 전부 미노출이면 all-missing (상태 D)', () => {
    expect(computeRawAreaState(false, false, false)).toBe('all-missing');
    expect(computeRawAreaState(false, false, null)).toBe('all-missing'); // 인플루언서 미검사여도 view/blog 다 false
  });

  it('검사된 영역이 없으면(전부 null) unknown', () => {
    expect(computeRawAreaState(null, null, null)).toBe('unknown');
  });
});

describe('computeVerdict — §20 시나리오', () => {
  const base = { status: 'ok' as const, consecutiveMissing: 0 };

  it('테스트1: 상위 노출 → 노출(신뢰도 높음)', () => {
    const v = computeVerdict({ ...base, view: true, blog: true, inf: true });
    expect(v.verdict).toBe('exposed');
    expect(v.confidence).toBe('high');
  });

  it('테스트2: 블로그 노출 + 통합검색 미노출 → 노출(미노출로 오판 금지)', () => {
    expect(computeVerdict({ ...base, view: false, blog: true, inf: false }).verdict).toBe('exposed');
  });

  it('테스트3: 인플루언서에만 노출 → 노출', () => {
    expect(computeVerdict({ ...base, view: false, blog: false, inf: true }).verdict).toBe('exposed');
  });

  it('테스트4: 어느 영역에서도 없음 → 1차는 재검사, 2회 연속부터 미노출 확정', () => {
    const first = computeVerdict({ ...base, view: false, blog: false, inf: false, consecutiveMissing: 1 });
    expect(first.verdict).toBe('recheck');
    expect(first.confidence).toBeNull();

    const second = computeVerdict({ ...base, view: false, blog: false, inf: false, consecutiveMissing: 2 });
    expect(second.verdict).toBe('missing');
    expect(second.confidence).toBe('medium');

    const third = computeVerdict({ ...base, view: false, blog: false, inf: false, consecutiveMissing: 3 });
    expect(third.verdict).toBe('missing');
    expect(third.confidence).toBe('high');
  });

  it('테스트5: 검색 API 오류 → 확인 불가(절대 미노출 아님)', () => {
    const v = computeVerdict({ ...base, view: null, blog: null, inf: null, status: 'error', consecutiveMissing: 2 });
    expect(v.verdict).toBe('error');
  });

  it('테스트6/8: 다른 사람/다른 블로그 글만 검색결과에 있으면 내 것은 all-missing → 재검증 대상', () => {
    // 검색 계층이 blogId+postId 불일치를 걸러 view/blog/inf=false 로 넘어온 상황
    expect(computeVerdict({ ...base, view: false, blog: false, inf: false, consecutiveMissing: 1 }).verdict).toBe('recheck');
  });

  it('§18: 발행 직후(색인 유예) all-missing 은 미노출이 아니라 확인 중', () => {
    const v = computeVerdict({ ...base, view: false, blog: false, inf: false, inIndexingGrace: true, consecutiveMissing: 2 });
    expect(v.verdict).toBe('checking');
  });

  it('분석불가(제목에서 검색어 생성 불가/비공개)는 미노출 아님', () => {
    expect(computeVerdict({ ...base, view: null, blog: null, inf: null, status: 'unanalyzable' }).verdict).toBe('unanalyzable');
  });

  it('전부 미검사(null)이면 확인 중', () => {
    expect(computeVerdict({ ...base, view: null, blog: null, inf: null }).verdict).toBe('checking');
  });
});

describe('confidenceForMissing (§14)', () => {
  it('연속 3회 이상 → 높음, 2회 → 보통, 그 미만 → 낮음', () => {
    expect(confidenceForMissing(3)).toBe('high');
    expect(confidenceForMissing(2)).toBe('medium');
    expect(confidenceForMissing(1)).toBe('low');
    expect(MISSING_CONFIRM_THRESHOLD).toBe(2);
  });
});
