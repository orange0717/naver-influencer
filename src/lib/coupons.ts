/** 무료 체험 쿠폰 코드 생성 (예: FREE7-A1B2C3) — 발급/즉시지급 라우트 공용 */
export function generateCouponCode(durationDays: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FREE${durationDays}-${suffix}`;
}
