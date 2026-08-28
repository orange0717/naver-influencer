import { createHash, randomBytes } from 'crypto';

/** 초대 유효기간. 만료된 초대는 좌석을 계속 물고 있지 않도록 재발송해야 한다. */
export const INVITE_TTL_DAYS = 7;

/**
 * 초대 토큰은 원문을 저장하지 않는다. DB에는 해시만 남기고 원문은 메일로만 나간다.
 * 수락 요청이 오면 받은 토큰을 같은 방식으로 해시해 대조한다.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function inviteExpiresAt(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}
