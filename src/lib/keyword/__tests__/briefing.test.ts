import { describe, it, expect } from 'vitest';
import { briefingEmptyReason } from '../briefing';

/**
 * 핵심 회귀 방지선: "변동 없음"과 "아직 확인하지 않음"을 절대 같은 화면으로 뭉개지 않는다.
 * 예전엔 둘 다 섹션이 사라져서 사용자가 고장인지 원래 그런 건지 알 수 없었다.
 */
describe('briefingEmptyReason — 세 상태를 절대 뭉개지 않는다', () => {
  it('순위 데이터가 아예 없으면 "아직 확인 안 함"이지 "변동 없음"이 아니다', () => {
    const r = briefingEmptyReason(0, 0);
    expect(r.kind).toBe('nothing-tracked');
    expect(r.title).not.toContain('변동이 없습니다');
  });

  it('순위는 있는데 비교할 이전 값이 없으면 "첫 측정"이다', () => {
    const r = briefingEmptyReason(12, 0);
    expect(r.kind).toBe('no-baseline');
    expect(r.detail).toContain('12개');
  });

  it('비교까지 했는데 그대로면 그때만 "변동 없음"이다', () => {
    const r = briefingEmptyReason(12, 9);
    expect(r.kind).toBe('no-change');
    expect(r.detail).toContain('9개');
  });

  it('세 상태의 문구가 서로 겹치지 않는다', () => {
    const titles = [
      briefingEmptyReason(0, 0).title,
      briefingEmptyReason(5, 0).title,
      briefingEmptyReason(5, 5).title,
    ];
    expect(new Set(titles).size).toBe(3);
  });

  it('음수·이상값이 들어와도 "변동 없음"으로 새지 않는다', () => {
    expect(briefingEmptyReason(-1, -1).kind).toBe('nothing-tracked');
    expect(briefingEmptyReason(3, -2).kind).toBe('no-baseline');
  });

  it('비교 가능 수가 추적 수보다 클 수는 없지만, 들어와도 터지지 않는다', () => {
    expect(briefingEmptyReason(2, 5).kind).toBe('no-change');
  });

  it('어떤 경우에도 빈 문구를 내지 않는다', () => {
    for (const [t, c] of [[0, 0], [1, 0], [1, 1], [999, 999]] as const) {
      const r = briefingEmptyReason(t, c);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
