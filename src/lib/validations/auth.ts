import { z } from 'zod';
import { naverIdSchema, blogIdSchema } from './index';

/** POST /api/auth/signup
 *  보안: naverId/blogId 는 의도적으로 제외. 가입 시점에 임의 인플루언서/블로그
 *  점유를 막기 위함. 가입 후 /api/my/link (인플루언서, demo OTP 검증)
 *  또는 /api/profile (블로그) 로 별도 연결한다.
 */
export const signupSchema = z.object({
  authId: z.string().min(1, 'authId는 필수입니다.'),
  email: z.string().email('이메일 형식이 올바르지 않습니다.'),
  nickname: z.string().min(1, '닉네임은 필수입니다.').max(50).transform((v) => v.trim()),
  // 블로그 ID 는 점유 위험이 없어 가입 시점에 저장 허용 (영문/숫자/밑줄/하이픈)
  blogId: z
    .string()
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, '블로그 ID 는 영문/숫자/밑줄/하이픈만 가능합니다.')
    .transform((v) => v.trim().toLowerCase())
    .optional(),
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
