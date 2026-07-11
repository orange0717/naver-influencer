import { describe, it, expect } from 'vitest';
import { hasActiveSubscription, isAdmin } from '../access-control';

describe('access-control', () => {
  describe('hasActiveSubscription', () => {
    it('만료된 구독은 false', () => {
      expect(hasActiveSubscription('INFLUENCER', '2020-01-01T00:00:00Z')).toBe(false);
    });

    it('미래 만료일 + plan 있으면 true', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(hasActiveSubscription('BLOGGER', future)).toBe(true);
    });

    it('plan 없으면 false', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(hasActiveSubscription(null, future)).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('ADMIN_USER_IDS 미설정 시 false', () => {
      expect(isAdmin('unknown-user-id')).toBe(false);
    });
  });
});
