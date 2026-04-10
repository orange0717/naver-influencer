import { z } from 'zod';
import { naverIdSchema, blogIdSchema } from './index';

/** POST /api/auth/signup */
export const signupSchema = z.object({
  authId: z.string().min(1, 'authId는 필수입니다.'),
  email: z.string().email('이메일 형식이 올바르지 않습니다.'),
  nickname: z.string().min(1, '닉네임은 필수입니다.').max(50).transform((v) => v.trim()),
  naverId: z.string().optional(),
  blogId: z.string().optional(),
});

/** POST /api/auth/blogger-login */
export const bloggerLoginSchema = z.object({
  blogId: blogIdSchema,
});

/** POST /api/auth/influencer-login */
export const influencerLoginSchema = z.object({
  naverId: naverIdSchema,
});

/** POST /api/auth/unified-login */
export const unifiedLoginSchema = z.object({
  blogId: z.string().optional(),
  naverId: z.string().optional(),
}).refine(
  (data) => data.blogId || data.naverId,
  { message: '블로그 또는 인플루언서 중 하나 이상 입력해주세요.' },
);
