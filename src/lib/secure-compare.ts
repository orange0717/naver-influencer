import crypto from 'crypto';

/** timing-safe 비교 (길이 노출 방지를 위해 SHA-256 해시 후 비교) */
export function timingSafeEqualSecret(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  const hashProvided = crypto.createHash('sha256').update(provided).digest();
  const hashExpected = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

/** Authorization 헤더(Bearer 또는 raw)와 env 토큰 timing-safe 비교 */
export function verifyAuthorizationToken(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) return false;
  const authHeader = request.headers.get('Authorization') || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!provided) return false;
  return timingSafeEqualSecret(provided, expectedToken);
}
