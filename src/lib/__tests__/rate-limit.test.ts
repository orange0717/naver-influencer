import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../rate-limit';

describe('createRateLimiter', () => {
  it('제한 내에서는 false 반환', async () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60000 });

    expect(await limiter.check('user1')).toBe(false);
    expect(await limiter.check('user1')).toBe(false);
    expect(await limiter.check('user1')).toBe(false);
  });

  it('제한 초과 시 true 반환', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60000 });

    expect(await limiter.check('user1')).toBe(false);
    expect(await limiter.check('user1')).toBe(false);
    expect(await limiter.check('user1')).toBe(true); // 초과
  });

  it('서로 다른 키는 독립적으로 카운트', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60000 });

    expect(await limiter.check('user1')).toBe(false);
    expect(await limiter.check('user2')).toBe(false);
    expect(await limiter.check('user1')).toBe(true); // user1만 초과
    expect(await limiter.check('user2')).toBe(true); // user2도 초과
  });

  it('윈도우가 지나면 카운트 초기화', async () => {
    vi.useFakeTimers();

    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

    expect(await limiter.check('user1')).toBe(false);
    expect(await limiter.check('user1')).toBe(true);

    // 1초 후
    vi.advanceTimersByTime(1100);

    expect(await limiter.check('user1')).toBe(false);

    vi.useRealTimers();
  });
});
