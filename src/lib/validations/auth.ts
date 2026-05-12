import { z } from 'zod';
import { naverIdSchema, blogIdSchema } from './index';
import { keywordChallengeCategorySchema } from '@/lib/keyword-challenge-categories';

/**
 * 비밀번호 정책: 8자 이상 + 영문 + 숫자 포함.
 * /auth/signup, /auth/reset, /orangeconnect/signup 클라이언트 검증 공용.
 */
export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (password.length < 8) return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' };
  if (!/[a-zA-Z]/.test(password)) return { ok: false, error: '비밀번호에 영문을 포함해주세요.' };
  if (!/[0-9]/.test(password)) return { ok: false, error: '비밀번호에 숫자를 포함해주세요.' };
  return { ok: true };
}

export const PASSWORD_PLACEHOLDER = '영문+숫자 포함 8자 이상';

/** POST /api/auth/signup
 *  보안: naverId/blogId 는 의도적으로 제외. 가입 시점에 임의 인플루언서/블로그
 *  점유를 막기 위함. 가입 후 /api/my/link (인플루언서, demo OTP 검증)
 *  또는 /api/profile (블로그) 로 별도 연결한다.
 *  keywordCategory: 키워드챌린지 DB와 동일한 주제 문자열 — 대시보드 주제 한정에 사용.
 */
export const signupSchema = z.object({
  authId: z.string().min(1, 'authId는 필수입니다.'),
  email: z.string().email('이메일 형식이 올바르지 않습니다.'),
  nickname: z.string().min(1, '닉네임은 필수입니다.').max(20, '닉네임은 20자 이하로 입력해주세요.').transform((v) => v.trim()),
  /** 키워드챌린지 주제 — DB 카테고리 문자열과 동일해야 `/my` 주제 한정에 사용됩니다. */
  keywordCategory: keywordChallengeCategorySchema,
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
