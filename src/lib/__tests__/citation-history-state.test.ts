import { describe, it, expect } from 'vitest';

import { citedState } from '@/components/home/AiBriefingSection.helpers';

const at = '2026-08-25T00:00:00.000Z';
const entry = (exposed: boolean | null, tabExposed: boolean | null) => ({ exposed, tabExposed, checkedAt: at });

// 인용 이력 타임라인은 exposed/tabExposed 를 그대로 받는데 둘 다 boolean | null 이다.
// null 을 false 로 뭉개면 "확인하지 못한 시점"이 이력에 '미인용'으로 남아버린다(스펙 §5 금지).
describe('citedState — 확인 못 한 시점을 미인용으로 적지 않는다', () => {
  it('둘 다 확인 못 했으면 null (미인용 아님)', () => {
    expect(citedState(entry(null, null))).toBeNull();
  });

  it('둘 다 확인했고 없었으면 false = 진짜 미인용', () => {
    expect(citedState(entry(false, false))).toBe(false);
  });

  it('한쪽이라도 인용됐으면 true', () => {
    expect(citedState(entry(true, false))).toBe(true);
    expect(citedState(entry(false, true))).toBe(true);
    expect(citedState(entry(true, true))).toBe(true);
  });

  // 한쪽만 확인에 성공했다면 그 확인 결과는 유효하다 — 나머지 미확인 때문에 판정을 버리지 않는다.
  it('한쪽만 확인 성공하고 없었으면 false', () => {
    expect(citedState(entry(false, null))).toBe(false);
    expect(citedState(entry(null, false))).toBe(false);
  });

  it('한쪽만 확인 성공하고 인용됐으면 true', () => {
    expect(citedState(entry(true, null))).toBe(true);
    expect(citedState(entry(null, true))).toBe(true);
  });
});
