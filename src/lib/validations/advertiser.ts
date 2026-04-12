import { z } from 'zod';

/** POST /api/ad/auth/signup */
export const advertiserSignupSchema = z.object({
  authId: z.string().min(1, 'authId는 필수입니다.'),
  email: z.string().email('이메일 형식이 올바르지 않습니다.'),
  companyName: z.string().min(1, '회사명을 입력해주세요.').max(100).transform(v => v.trim()),
  businessNumber: z.string()
    .transform(v => v.replace(/[^0-9]/g, ''))
    .refine(v => v.length === 0 || v.length === 10, '사업자등록번호는 10자리여야 합니다.')
    .optional(),
  contactName: z.string().min(1, '담당자명을 입력해주세요.').max(50).transform(v => v.trim()),
  contactPhone: z.string().max(20).optional(),
  industry: z.string().max(50).optional(),
});

/** POST /api/ad/campaigns */
export const campaignCreateSchema = z.object({
  title: z.string().min(1, '캠페인명을 입력해주세요.').max(200).transform(v => v.trim()),
  description: z.string().max(5000).optional(),
  category: z.string().max(50).optional(),
  region: z.string().max(50).optional(),
  campaignType: z.enum(['review', 'experience', 'sponsored']).default('review'),
  budget: z.number().int().min(0).max(999999999).optional(),
  feePerPost: z.number().int().min(0).max(99999999).optional(),
  maxParticipants: z.number().int().min(1).max(1000).default(1),
  deadline: z.string().optional(),
  postingDeadline: z.string().optional(),
  requirements: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active']).default('draft'),
});

/** PATCH /api/ad/campaigns/[id] */
export const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  status: z.enum(['draft', 'active', 'closed', 'completed', 'canceled']).optional(),
});

/** PATCH /api/ad/campaigns/[id]/applications/[appId] */
export const applicationActionSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});
