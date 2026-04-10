/**
 * 포트원 V2 결제 설정
 */

export const PAYMENT_PLANS: Record<string, {
  amount: number;
  durationDays: number;
  name: string;
  planName: string;
}> = {
  PRO_ANNUAL: {
    amount: 99000,       // TODO: 가격 확정 후 변경
    durationDays: 365,
    name: 'PRO 연간 이용권',
    planName: 'PRO',
  },
};
