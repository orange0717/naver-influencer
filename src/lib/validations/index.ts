import { NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';

/**
 * 요청 body를 Zod 스키마로 검증한다.
 * 성공 시 파싱된 데이터를, 실패 시 400 응답을 반환한다.
 */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: '입력값이 올바르지 않습니다.', details: result.error.flatten().fieldErrors },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}

/**
 * URL searchParams를 Zod 스키마로 검증한다.
 */
export function validateSearchParams<T>(schema: ZodSchema<T>, params: URLSearchParams):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const obj: Record<string, string> = {};
  params.forEach((v, k) => { obj[k] = v; });
  const result = schema.safeParse(obj);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: '파라미터가 올바르지 않습니다.', details: result.error.flatten().fieldErrors },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}

// ─── 공용 스키마 ───

/** 네이버 ID (인플루언서/블로거) — 영문, 숫자, 밑줄, 하이픈, 마침표 허용 */
export const naverIdSchema = z
  .string()
  .min(2, '2자 이상 입력해주세요.')
  .max(30, '30자 이하로 입력해주세요.')
  .regex(/^[a-zA-Z0-9._-]+$/, '영문, 숫자, 밑줄, 하이픈, 마침표만 사용 가능합니다.')
  .transform((v) => v.trim().toLowerCase());

/** 블로그 ID (영문,숫자,밑줄,하이픈) */
export const blogIdSchema = z
  .string()
  .min(2, '2자 이상 입력해주세요.')
  .max(30, '30자 이하로 입력해주세요.')
  .regex(/^[a-zA-Z0-9_-]+$/, '영문, 숫자, 밑줄, 하이픈만 사용 가능합니다.')
  .transform((v) => v.trim().toLowerCase());

/** 페이지네이션 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** 인플루언서 연결 */
export const linkInfluencerSchema = z.object({
  naverId: naverIdSchema,
});

/** 프로필 업데이트 — 인플루언서 연결은 /my/link, 해제만 여기서 허용 */
export const profileUpdateSchema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  blog_id: z.string().max(50).optional(),
  unlink_influencer: z.literal(true).optional(),
  ad_fee_amount: z.number().int().min(0).max(99999999).nullable().optional(),
  ad_fee_text: z.string().max(200).optional(),
  ad_process: z.string().max(1000).optional(),
  ad_schedule: z.string().max(500).optional(),
  sns_instagram: z.string().max(200).optional(),
  sns_youtube: z.string().max(200).optional(),
  sns_x: z.string().max(200).optional(),
  sns_tiktok: z.string().max(200).optional(),
});
