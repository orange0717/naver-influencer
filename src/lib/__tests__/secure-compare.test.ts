import { describe, expect, it } from 'vitest';
import { timingSafeEqualSecret } from '@/lib/secure-compare';

describe('timingSafeEqualSecret', () => {
  it('returns true for matching secrets', () => {
    expect(timingSafeEqualSecret('abc', 'abc')).toBe(true);
  });

  it('returns false for mismatched secrets', () => {
    expect(timingSafeEqualSecret('abc', 'abd')).toBe(false);
  });

  it('returns false when either value is empty', () => {
    expect(timingSafeEqualSecret('', 'abc')).toBe(false);
    expect(timingSafeEqualSecret('abc', '')).toBe(false);
  });
});
