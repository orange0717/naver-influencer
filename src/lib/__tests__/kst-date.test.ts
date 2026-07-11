import { describe, it, expect } from 'vitest';
import { getKSTDateString, KST_OFFSET_MS } from '../kst-date';

describe('getKSTDateString', () => {
  it('KST 자정 직전 UTC는 전날 KST 날짜', () => {
    // 2026-07-10 14:30 UTC = 2026-07-10 23:30 KST
    const utc = Date.UTC(2026, 6, 10, 14, 30, 0);
    expect(getKSTDateString(utc)).toBe('2026-07-10');
  });

  it('KST 자정 이후 UTC는 당일 KST 날짜', () => {
    // 2026-07-10 15:00 UTC = 2026-07-11 00:00 KST
    const utc = Date.UTC(2026, 6, 10, 15, 0, 0);
    expect(getKSTDateString(utc)).toBe('2026-07-11');
  });

  it('KST_OFFSET_MS는 9시간', () => {
    expect(KST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });
});
