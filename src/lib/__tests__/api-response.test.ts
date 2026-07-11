import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { jsonError, internalError, dbError } from '../api-response';

describe('api-response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('jsonError returns message and status', async () => {
    const res = jsonError('잘못된 요청', 400);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: '잘못된 요청' });
  });

  it('internalError hides internal details from client', async () => {
    const res = internalError('test/module', new Error('secret db failure'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('secret');
    expect(body.error).toContain('서버 오류');
  });

  it('dbError returns generic database message', async () => {
    const res = dbError('test/module', { message: 'relation "foo" does not exist' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('relation');
  });
});
