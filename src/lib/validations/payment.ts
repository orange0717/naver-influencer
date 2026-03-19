import { z } from 'zod';

/** POST /api/payment/confirm */
export const paymentConfirmSchema = z.object({
  paymentKey: z.string().min(1, 'paymentKey는 필수입니다.'),
  orderId: z.string().min(1, 'orderId는 필수입니다.'),
  amount: z.number().int().positive('결제 금액은 양수여야 합니다.'),
});

/** POST /api/license — 이용권 활성화 */
export const licenseActivateSchema = z.object({
  license_code: z
    .string()
    .min(1, '이용권 코드를 입력해주세요.')
    .transform((v) => v.trim().toUpperCase()),
  buyer_name: z.string().max(50).optional(),
});

/** POST /api/license/generate — 이용권 대량 생성 */
export const licenseGenerateSchema = z.object({
  secret: z.string().min(1),
  count: z.number().int().min(1).max(100).default(10),
  plan_name: z.string().default('PRO'),
  duration_days: z.number().int().min(1).default(30),
  price: z.number().int().min(0).default(9900),
});

/** PATCH /api/profile */
export const profileUpdateSchema = z.object({
  nickname: z.string().min(1).max(50).transform((v) => v.trim()).optional(),
  linked_influencer_id: z.string().uuid().nullable().optional(),
}).refine(
  (data) => data.nickname !== undefined || data.linked_influencer_id !== undefined,
  { message: '수정할 항목이 없습니다.' },
);

/** POST /api/my/link */
export const linkInfluencerSchema = z.object({
  naverId: z
    .string()
    .min(2, '인플루언서 ID를 입력해주세요.')
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, 'ID 형식이 올바르지 않습니다.'),
});
